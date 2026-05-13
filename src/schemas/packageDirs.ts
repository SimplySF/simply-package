/*
 * Copyright (c) 2026, Clay Chipps; Copyright (c) 2026 Salesforce, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
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
