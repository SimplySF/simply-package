/*
 * Copyright (c) 2024, Clay Chipps; Copyright (c) 2024, Salesforce.com, Inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages, Logger } from '@salesforce/core';
import {
  Package,
  PackageSaveResult,
  PackageVersion,
  PackageVersionListOptions,
  PackageVersionOptions,
} from '@salesforce/packaging';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@simplysf/simply-package', 'simply.package.version.cleanup');

export type PackageVersionCleanupResult = {
  Error?: string;
  Success: boolean;
  SubscriberPackageVersionId: string;
};

export default class PackageVersionCleanup extends SfCommand<PackageVersionCleanupResult[]> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');
  // This is annoying, but the underlying Salesforce Packaging API expects you to be in a project context
  // https://github.com/forcedotcom/packaging/blob/49e2f0b76a8d206369bf99906d02f6c54d89247d/src/package/package.ts#L144
  public static readonly requiresProject = true;

  public static readonly flags = {
    'api-version': Flags.orgApiVersion(),
    matcher: Flags.string({
      summary: messages.getMessage('flags.matcher.summary'),
      description: messages.getMessage('flags.matcher.description'),
      char: 's',
      required: true,
    }),
    package: Flags.string({
      summary: messages.getMessage('flags.package.summary'),
      description: messages.getMessage('flags.package.description'),
      char: 'p',
      required: true,
    }),
    'target-dev-hub': Flags.requiredHub(),
  };

  public async run(): Promise<PackageVersionCleanupResult[]> {
    const log = await Logger.child(this.ctor.name);

    const { flags } = await this.parse(PackageVersionCleanup);

    // Create a connection to the org
    const connection = flags['target-dev-hub']?.getConnection(flags['api-version']);

    if (!connection) {
      throw messages.createError('errors.connectionFailed');
    }

    const project = this.project;

    const matcher = flags.matcher;
    const matcherRegex = new RegExp(/^\d+\.\d+\.\d+$/);
    const matcherValid = matcherRegex.test(matcher);

    if (!matcherValid) {
      throw messages.createError('errors.matcherFormatMismatch');
    }

    const matcherSplit = matcher.split('.');
    const majorMatcher = matcherSplit.at(0);
    const minorMatcher = matcherSplit.at(1);
    const patchMatcher = matcherSplit.at(2);

    log.info(`Major Matcher ${majorMatcher} Minor Matcher ${minorMatcher} Patch Matcher ${patchMatcher}`);

    const packageVersionListOptions: PackageVersionListOptions = {
      concise: false,
      createdLastDays: undefined as unknown as number,
      modifiedLastDays: undefined as unknown as number,
      orderBy: 'MajorVersion, MinorVersion, PatchVersion, BuildNumber',
      packages: [flags.package],
      isReleased: false,
      verbose: true,
    };

    this.spinner.start('Analyzing which package versions to delete...');

    const packageVersions = await Package.listVersions(connection, project, packageVersionListOptions);

    const targetVersions = packageVersions.filter(
      (packageVersion) =>
        packageVersion.IsReleased === false &&
        packageVersion.MajorVersion.toString() === majorMatcher &&
        packageVersion.MinorVersion.toString() === minorMatcher &&
        packageVersion.PatchVersion.toString() === patchMatcher
    );

    const packageVersionDeletePromiseRequests: Array<Promise<PackageSaveResult>> = [];

    targetVersions.forEach((targetVersion) => {
      const packageVersionOptions: PackageVersionOptions = {
        connection,
        project,
        idOrAlias: targetVersion.SubscriberPackageVersionId,
      };

      packageVersionDeletePromiseRequests.push(new PackageVersion(packageVersionOptions).delete());
    });

    const results: PackageVersionCleanupResult[] = [];

    this.spinner.stop();

    this.spinner.start('Deleting the package versions...');

    const promiseResults = await Promise.allSettled(packageVersionDeletePromiseRequests);

    promiseResults.forEach((promiseResult, index) => {
      switch (promiseResult.status) {
        case 'fulfilled':
          results.push({
            Success: promiseResult?.value?.success,
            SubscriberPackageVersionId: targetVersions[index].SubscriberPackageVersionId,
          });
          break;
        case 'rejected':
          results.push({
            Success: false,
            Error: promiseResult.reason as string,
            SubscriberPackageVersionId: targetVersions[index].SubscriberPackageVersionId,
          });
          break;
      }
    });

    this.spinner.stop();

    this.displayDeletionResults(results);

    return results;
  }

  private displayDeletionResults(packageCleanupResults: PackageVersionCleanupResult[]): void {
    this.styledHeader('Package Version Cleanup Results');
    this.table(packageCleanupResults, {
      SubscriberPackageVersionId: { header: 'PACKAGE VERSION ID' },
      Success: { header: 'SUCCESS' },
      Error: { header: 'ERROR' },
    });
  }
}
