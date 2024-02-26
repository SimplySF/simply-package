/*
 * Copyright (c) 2024, Clay Chipps; Copyright (c) 2024, Salesforce.com, Inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { Connection, SfError } from '@salesforce/core';
import { InstalledPackages, PackagingSObjects } from '@salesforce/packaging';

type PackageInstallRequest = PackagingSObjects.PackageInstallRequest;

export const PACKAGE_PREFIX_PACKAGE2 = '0Ho';
export const PACKAGE_PREFIX_PACKAGE2_VERSION = '05i';
export const PACKAGE_PREFIX_SUBSCRIBER_PACKAGE = '033';
export const PACKAGE_PREFIX_SUBSCRIBER_PACKAGE_VERSION = '04t';

export const isPackage2Id = (inputToEvaluate: string): boolean =>
  inputToEvaluate ? inputToEvaluate.startsWith(PACKAGE_PREFIX_PACKAGE2) : false;

export const isPackage2VersionId = (inputToEvaluate: string): boolean =>
  inputToEvaluate ? inputToEvaluate.startsWith(PACKAGE_PREFIX_PACKAGE2_VERSION) : false;

export const isSubscriberPackageId = (inputToEvaluate: string): boolean =>
  inputToEvaluate ? inputToEvaluate.startsWith(PACKAGE_PREFIX_SUBSCRIBER_PACKAGE) : false;

export const isSubscriberPackageVersionId = (inputToEvaluate: string): boolean =>
  inputToEvaluate ? inputToEvaluate.startsWith(PACKAGE_PREFIX_SUBSCRIBER_PACKAGE_VERSION) : false;

export const isSubscriberPackageVersionInstalled = (
  installedPackages: InstalledPackages[],
  subscriberPackageVersionId: string
): boolean =>
  installedPackages.some(
    (installedPackage) => installedPackage?.SubscriberPackageVersion?.Id === subscriberPackageVersionId
  );

export const reducePackageInstallRequestErrors = (request: PackageInstallRequest): string => {
  let errorMessage = '<empty>';
  const errors = request?.Errors?.errors;
  if (errors?.length) {
    errorMessage = 'Installation errors: ';
    for (let i = 0; i < errors.length; i++) {
      errorMessage += `\n${i + 1}) ${errors[i].message}`;
    }
  }

  return errorMessage;
};

export const resolveSubscriberPackageVersionId = async (
  package2Id: string,
  versionNumber: string,
  branch: string,
  connection: Connection
): Promise<string> => {
  if (isSubscriberPackageVersionId(package2Id)) {
    return package2Id;
  }

  if (!isPackage2Id(package2Id)) {
    throw new SfError('The Package2Id provided is not a valid Package2Id');
  }

  // Strip out the "-LATEST" string as it won't be needed in the query.
  const versionWorking = versionNumber.toUpperCase().replace('-LATEST', '').replace('.LATEST', '');

  // Split the remaining "Major.Minor.Patch.BuildNumber" version number out to its individual integers.
  const versionParts = versionWorking.split('.');

  // Assemble the query needed
  let query = `SELECT SubscriberPackageVersionId, IsPasswordProtected, IsReleased FROM Package2Version WHERE Package2Id='${package2Id}' AND MajorVersion=${versionParts[0]} AND IsDeprecated = FALSE`;

  // If Minor Version isn't set to LATEST, look for the exact Minor Version
  if (versionParts[1]) {
    query += ` AND MinorVersion=${versionParts[1]}`;
  }

  // If Patch Version isn't set to LATEST, look for the exact Patch Version
  if (versionParts[2]) {
    query += ` AND PatchVersion=${versionParts[2]}`;
  }

  // If Build Number isn't set to LATEST, look for the exact Build Version
  if (versionParts[3]) {
    query += ` AND BuildNumber=${versionParts[3]}`;
  }

  // If Branch is specified, use it to filter
  if (branch) {
    query += ` AND Branch='${branch.trim()}'`;
  } else {
    query += ' AND Branch=NULL';
  }

  // if the query is looking for a "LATEST", "Non-pinned" version, then we need
  //  to sort the result list in such a manner to that the latest version will
  //  be the first record in the result set.
  query += ' ORDER BY MajorVersion DESC, MinorVersion DESC, PatchVersion DESC, BuildNumber DESC LIMIT 1';

  const resultPackageVersionRecord = await connection.tooling.query(query);

  if (resultPackageVersionRecord?.records?.length === 0) {
    throw new SfError(`Unable to find SubscriberPackageVersionId for dependent package ${package2Id}`);
  }

  return resultPackageVersionRecord.records[0]['SubscriberPackageVersionId'] as string;
};
