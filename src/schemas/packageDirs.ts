/*
 * Copyright (c) 2024, Clay Chipps; Copyright (c) 2024, Salesforce.com, Inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { PackageDirDependency } from '@salesforce/schemas';

/** type required just for projects, regardless of 1gp/2gp package use */
export type BasePackageDir = {
  /**
   * If you have specified more than one path, include this parameter for the default path to indicate which is the default package directory.
   *
   * @title default
   * @default true
   */
  default?: boolean;
  /**
   * If you don’t specify a path, the Salesforce CLI uses a placeholder when you create a package.
   *
   * @title Path
   */
  path: string;
};

export type BasePackageDirWithDependencies = BasePackageDir & {
  /**
   * To specify dependencies for 2GP within the same Dev Hub, use either the package version alias or a combination of the package name and the version number.
   */
  dependencies?: PackageDirDependency[];
};
