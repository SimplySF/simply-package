/*
 * Copyright (c) 2024, Clay Chipps; Copyright (c) 2024, Salesforce.com, Inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable complexity */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-unsafe-finally */
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { AuthInfo, Connection, Messages, Lifecycle, PackageDirDependency, SfError } from '@salesforce/core';
import { Duration } from '@salesforce/kit';
import {
  InstalledPackages,
  PackageEvents,
  PackageInstallCreateRequest,
  PackageInstallOptions,
  SubscriberPackageVersion,
  PackagingSObjects,
} from '@salesforce/packaging';
import { Optional } from '@salesforce/ts-types';
import {
  isPackage2Id,
  isSubscriberPackageVersionId,
  isSubscriberPackageVersionInstalled,
  reducePackageInstallRequestErrors,
  resolveSubscriberPackageVersionId,
} from '../../../../common/packageUtils.js';

type PackageInstallRequest = PackagingSObjects.PackageInstallRequest;

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('sf-chipps-package', 'chipps.package.dependencies.install');

export type PackageToInstall = {
  packageName: string;
  skip: boolean;
  status: string;
  subscriberPackageVersionId: string;
};

const installType = { All: 'all', Delta: 'delta', Upgrade: 'upgrade' };
const securityType = { AllUsers: 'full', AdminsOnly: 'none' };
const upgradeType = { Delete: 'delete-only', DeprecateOnly: 'deprecate-only', Mixed: 'mixed-mode' };

const installationKeyRegex = new RegExp(/^(\w+:\w+)(,\s*\w+:\w+)*/);

export default class PackageDependenciesInstall extends SfCommand<PackageToInstall[]> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');
  public static readonly requiresProject = true;

  public static readonly flags = {
    'apex-compile': Flags.custom<PackageInstallCreateRequest['ApexCompileType']>({
      options: ['all', 'package'],
    })({
      summary: messages.getMessage('flags.apex-compile.summary'),
      description: messages.getMessage('flags.apex-compile.description'),
      char: 'a',
    }),
    'api-version': Flags.orgApiVersion(),
    branch: Flags.string({
      summary: messages.getMessage('flags.branch.summary'),
      description: messages.getMessage('flags.branch.description'),
      char: 'z',
      default: '',
    }),
    'install-type': Flags.custom<'All' | 'Delta' | 'Upgrade'>({
      options: ['All', 'Delta', 'Upgrade'],
    })({
      char: 'i',
      summary: messages.getMessage('flags.install-type.summary'),
      description: messages.getMessage('flags.install-type.description'),
      default: 'Upgrade',
    }),
    'installation-key': Flags.string({
      summary: messages.getMessage('flags.installation-key.summary'),
      description: messages.getMessage('flags.installation-key.description'),
      char: 'k',
      multiple: true,
    }),
    'no-prompt': Flags.boolean({
      summary: messages.getMessage('flags.no-prompt.summary'),
      description: messages.getMessage('flags.no-prompt.description'),
      char: 'r',
      default: false,
      required: false,
    }),
    'publish-wait': Flags.duration({
      unit: 'minutes',
      summary: messages.getMessage('flags.publish-wait.summary'),
      char: 'b',
      default: Duration.minutes(0),
    }),
    'security-type': Flags.custom<'AllUsers' | 'AdminsOnly'>({
      options: ['AllUsers', 'AdminsOnly'],
    })({
      char: 's',
      summary: messages.getMessage('flags.security-type.summary'),
      default: 'AdminsOnly',
    }),
    'skip-handlers': Flags.string({
      multiple: true,
      options: ['FeatureEnforcement'],
      char: 'l',
      summary: messages.getMessage('flags.skip-handlers.summary'),
      description: messages.getMessage('flags.skip-handlers.description'),
      hidden: true,
    }),
    'target-dev-hub': Flags.string({
      summary: messages.getMessage('flags.target-dev-hub.summary'),
      char: 'v',
    }),
    'target-org': Flags.requiredOrg(),
    'upgrade-type': Flags.custom<'DeprecateOnly' | 'Mixed' | 'Delete'>({
      options: ['DeprecateOnly', 'Mixed', 'Delete'],
    })({
      char: 't',
      summary: messages.getMessage('flags.upgrade-type.summary'),
      description: messages.getMessage('flags.upgrade-type.description'),
      default: 'Mixed',
    }),
    wait: Flags.duration({
      unit: 'minutes',
      char: 'w',
      summary: messages.getMessage('flags.wait.summary'),
      default: Duration.minutes(30),
    }),
  };

  public async run(): Promise<PackageToInstall[]> {
    const { flags } = await this.parse(PackageDependenciesInstall);

    // Authorize to the target org
    const targetOrgConnection = flags['target-org']?.getConnection(flags['api-version']);

    if (!targetOrgConnection) {
      throw messages.createError('error.targetOrgConnectionFailed');
    }

    // Validate minimum api version
    const apiVersion = parseInt(targetOrgConnection.getApiVersion(), 10);
    if (apiVersion < 36) {
      throw messages.createError('error.apiVersionTooLow');
    }

    let packagesToInstall: Map<string, PackageToInstall> = new Map();
    const packageInstallRequests: PackageInstallRequest[] = [];
    const devHubDependencies: PackageDirDependency[] = [];

    this.spinner.start('Analyzing project to determine packages to install', '\n', { stdout: true });

    for (const packageDirectory of this.project?.getPackageDirectories() ?? []) {
      for (const dependency of packageDirectory?.dependencies ?? []) {
        if (dependency.package && dependency.versionNumber) {
          // These package dependencies must resolved within the Devhub
          // package represents a Package2.Id (0Ho)
          // versionNumber represents a semantic version (1.2.0.1 or 1.2.0.LATEST)
          devHubDependencies.push(dependency);
          continue;
        }

        const subscriberPackageVersionId = this.project.getPackageIdFromAlias(dependency.package) ?? dependency.package;

        if (!isSubscriberPackageVersionId(subscriberPackageVersionId)) {
          throw messages.createError('error.invalidSubscriberPackageVersionId', [dependency.package]);
        }

        packagesToInstall.set(subscriberPackageVersionId, {
          packageName: dependency.package,
          skip: false,
          status: '',
          subscriberPackageVersionId,
        });
      }
    }

    this.spinner.stop();

    if (devHubDependencies.length > 0) {
      this.spinner.start('Resolving SubscriberPackageVersionIds from the Devhub', '\n', { stdout: true });

      if (!flags['target-dev-hub']) {
        throw messages.createError('error.targetDevHubMissing');
      }

      // Initialize the authorization for the provided dev hub
      const targetDevHubAuthInfo = await AuthInfo.create({ username: flags['target-dev-hub'] });

      // Create a connection to the dev hub
      const targetDevHubConnection = await Connection.create({ authInfo: targetDevHubAuthInfo });

      if (!targetDevHubConnection) {
        throw messages.createError('error.targetDevHubConnectionFailed');
      }

      for (const devHubDependency of devHubDependencies) {
        if (!devHubDependency.package || !devHubDependency.versionNumber) {
          continue;
        }

        const package2Id = this.project.getPackageIdFromAlias(devHubDependency.package) ?? devHubDependency.package;

        if (!isPackage2Id(package2Id)) {
          throw messages.createError('error.invalidPackage2Id', [devHubDependency.package]);
        }

        const subscriberPackageVersionId = await resolveSubscriberPackageVersionId(
          package2Id,
          devHubDependency.versionNumber,
          flags.branch,
          targetDevHubConnection
        );

        if (!isSubscriberPackageVersionId(subscriberPackageVersionId)) {
          throw messages.createError('error.invalidSubscriberPackageVersionId', [devHubDependency.package]);
        }

        packagesToInstall.set(subscriberPackageVersionId, {
          packageName: devHubDependency.package,
          skip: false,
          status: '',
          subscriberPackageVersionId,
        });
      }

      this.spinner.stop();
    }

    if (packagesToInstall?.size === 0) {
      this.log('No packages were found to install');
      return [];
    }

    // Process any installation keys for the packages
    const installationKeyMap = new Map<string, string>();

    if (flags['installation-key']) {
      this.spinner.start('Processing package installation keys', '\n', { stdout: true });
      for (let installationKey of flags['installation-key']) {
        installationKey = installationKey.trim();

        const isKeyValid = installationKeyRegex.test(installationKey);

        if (!isKeyValid) {
          throw messages.createError('error.installationKeyFormat');
        }

        const installationKeyPair = installationKey.split(':');
        const packageVersionId = this.project.getPackageIdFromAlias(installationKeyPair[0]) ?? installationKeyPair[0];
        const packageInstallationKey = installationKeyPair[1];

        if (!isSubscriberPackageVersionId(packageVersionId)) {
          throw messages.createError('error.invalidSubscriberPackageVersionId', [packageVersionId]);
        }

        installationKeyMap.set(packageVersionId, packageInstallationKey);
      }
      this.spinner.stop();
    }

    this.spinner.start('Analyzing which packages to install', '\n', { stdout: true });

    let installedPackages: InstalledPackages[] = [];

    // If Delta or Upgrade install is selected, get the installed packages from the org
    if (
      installType[flags['install-type']] === installType.Delta ||
      installType[flags['install-type']] === installType.Upgrade
    ) {
      installedPackages = await SubscriberPackageVersion.installedList(targetOrgConnection);
    }

    // If we are performing a Delta install, check if the package is already installed
    if (installType[flags['install-type']] === installType.Delta) {
      // Construct an array of installed SubscriberPackageVersionIds
      const installedSubscriberPackageVersionIds = installedPackages.map(
        (installedPackage) => installedPackage.SubscriberPackageVersionId
      );

      for (const [subscriberPackageVersionId, packageToInstall] of packagesToInstall) {
        if (installedSubscriberPackageVersionIds.includes(subscriberPackageVersionId)) {
          packageToInstall.skip = true;
          packageToInstall.status = 'Skipped';

          this.log(
            `Package ${packageToInstall?.packageName} (${packageToInstall?.subscriberPackageVersionId}) is already installed and will be skipped`
          );
        }
      }
    }

    // If we are performing an Upgrade install, check if the package is an upgrade
    if (installType[flags['install-type']] === installType.Upgrade) {
      // Construct a map of installed SubscriberPackageIds
      const installedSubscriberPackageIds = new Map(
        installedPackages.map((installedPackage) => [installedPackage.SubscriberPackageId, installedPackage])
      );

      // Construct a map of installed SubscriberPackageVersionIds
      const installedSubscriberPackageVersionIds = new Map(
        installedPackages.map((installedPackage) => [installedPackage.SubscriberPackageVersionId, installedPackage])
      );

      // We first need to check for SubscriberPackageVersionIds that are already installed
      for (const [subscriberPackageVersionId, packageToInstall] of packagesToInstall) {
        if (installedSubscriberPackageVersionIds.has(subscriberPackageVersionId)) {
          packageToInstall.skip = true;
          packageToInstall.status = 'Skipped';

          this.log(
            `Package ${packageToInstall?.packageName} (${packageToInstall?.subscriberPackageVersionId}) is already installed and will be skipped`
          );

        }
      }

      // Retrieve the SubscriberPackage for the packages that we still need to install

    

        // If the exact package is NOT already installed, then we need to determine if this is an upgrade
        const 

        const subscriberPackageVersion = new SubscriberPackageVersion({
          aliasOrId: packageToInstall?.subscriberPackageVersionId,
          connection: targetOrgConnection,
          password: undefined,
        });

        await subscriberPackageVersion.getVersionNumber();

        if (isPackageVersionInstalled(installedPackages, packageToInstall?.SubscriberPackageVersionId)) {
          packageToInstall.Skip = true;
          packageToInstall.Status = 'Skipped';

          this.log(
            `Package ${packageToInstall?.PackageName} (${packageToInstall?.SubscriberPackageVersionId}) is already installed and will be skipped`
          );
        }
      }
    }

    for (const packageToInstall of packagesToInstall) {
      if (packageToInstall.Skip) {
        continue;
      }

      this.spinner.start(`Installing package ${packageToInstall.PackageName}`, '\n', { stdout: true });

      let installationKey = '';
      // Check if we have an installation key for this package
      if (installationKeyMap.has(packageToInstall?.SubscriberPackageVersionId)) {
        // If we do, set the installation key value
        installationKey = installationKeyMap.get(packageToInstall?.SubscriberPackageVersionId) ?? '';
      }

      const subscriberPackageVersion = new SubscriberPackageVersion({
        aliasOrId: packageToInstall?.SubscriberPackageVersionId,
        connection: targetOrgConnection,
        password: installationKey,
      });

      const request: PackageInstallCreateRequest = {
        ApexCompileType: flags['apex-compile'],
        EnableRss: true,
        Password: installationKey,
        SecurityType: securityType[flags['security-type']] as PackageInstallCreateRequest['SecurityType'],
        SkipHandlers: flags['skip-handlers']?.join(','),
        SubscriberPackageVersionKey: await subscriberPackageVersion.getId(),
        UpgradeType: upgradeType[flags['upgrade-type']] as PackageInstallCreateRequest['UpgradeType'],
      };

      // eslint-disable-next-line @typescript-eslint/require-await
      Lifecycle.getInstance().on(PackageEvents.install.warning, async (warningMsg: string) => {
        this.warn(warningMsg);
      });

      this.spinner.stop();

      if (flags['publish-wait']?.milliseconds > 0) {
        let timeThen = Date.now();
        // waiting for publish to finish
        let remainingTime = flags['publish-wait'];

        Lifecycle.getInstance().on(
          PackageEvents.install['subscriber-status'],
          // eslint-disable-next-line @typescript-eslint/require-await
          async (publishStatus: PackagingSObjects.InstallValidationStatus) => {
            const elapsedTime = Duration.milliseconds(Date.now() - timeThen);
            timeThen = Date.now();
            remainingTime = Duration.milliseconds(remainingTime.milliseconds - elapsedTime.milliseconds);
            const status =
              publishStatus === 'NO_ERRORS_DETECTED' ? 'Available for installation' : 'Unavailable for installation';
            this.spinner.status = `${remainingTime.minutes} minutes remaining until timeout. Publish status: ${status}\n`;
          }
        );

        this.spinner.start(
          `${remainingTime.minutes} minutes remaining until timeout. Publish status: 'Querying Status'`,
          '\n',
          { stdout: true }
        );

        await subscriberPackageVersion.waitForPublish({
          publishTimeout: flags['publish-wait'],
          publishFrequency: Duration.seconds(10),
          installationKey,
        });

        // need to stop the spinner to avoid weird behavior with the prompts below
        this.spinner.stop();
      }

      // If the user has not specified --no-prompt, process prompts
      if (!flags['no-prompt']) {
        // If the user has specified --upgradetype Delete, then prompt for confirmation for Unlocked Packages
        if (flags['upgrade-type'] === 'Delete' && (await subscriberPackageVersion.getPackageType()) === 'Unlocked') {
          const promptMsg = messages.getMessage('prompt.upgradeType');
          if (!(await this.confirm(promptMsg))) {
            throw messages.createError('info.canceledPackageInstall');
          }
        }

        // If the package has external sites, ask the user for permission to enable them
        const externalSites = await subscriberPackageVersion.getExternalSites();
        if (externalSites) {
          const promptMsg = messages.getMessage('prompt.enableRss', [externalSites.join('\n')]);
          request.EnableRss = await this.confirm(promptMsg);
        }
      }

      let installOptions: Optional<PackageInstallOptions>;
      if (flags.wait) {
        installOptions = {
          pollingTimeout: flags.wait,
          pollingFrequency: Duration.seconds(2),
        };
        let remainingTime = flags.wait;
        let timeThen = Date.now();

        // waiting for package install to finish
        Lifecycle.getInstance().on(
          PackageEvents.install.status,
          // eslint-disable-next-line @typescript-eslint/require-await
          async (piRequest: PackageInstallRequest) => {
            const elapsedTime = Duration.milliseconds(Date.now() - timeThen);
            timeThen = Date.now();
            remainingTime = Duration.milliseconds(remainingTime.milliseconds - elapsedTime.milliseconds);
            this.spinner.status = `${remainingTime.minutes} minutes remaining until timeout. Install status: ${piRequest.Status}\n`;
          }
        );
      }

      let pkgInstallRequest: Optional<PackageInstallRequest>;
      try {
        this.spinner.start(`Installing package ${packageToInstall.PackageName}`, '\n', { stdout: true });
        pkgInstallRequest = await subscriberPackageVersion.install(request, installOptions);
        this.spinner.stop();
      } catch (error: unknown) {
        if (error instanceof SfError && error.data) {
          pkgInstallRequest = error.data as PackageInstallRequest;
          this.spinner.stop(messages.getMessage('error.packageInstallPollingTimeout'));
        } else {
          throw error;
        }
      } finally {
        if (pkgInstallRequest) {
          if (pkgInstallRequest.Status === 'SUCCESS') {
            packageToInstall.Status = 'Installed';
            packageInstallRequests.push(pkgInstallRequest);
          } else if (['IN_PROGRESS', 'UNKNOWN'].includes(pkgInstallRequest.Status)) {
            packageToInstall.Status = 'Installing';
            throw messages.createError('error.packageInstallInProgress', [
              this.config.bin,
              pkgInstallRequest.Id,
              targetOrgConnection.getUsername() as string,
            ]);
          } else {
            packageToInstall.Status = 'Failed';
            throw messages.createError('error.packageInstall', [reducePackageInstallRequestErrors(pkgInstallRequest)]);
          }
        }
      }
    }

    return packagesToInstall;
  }
}