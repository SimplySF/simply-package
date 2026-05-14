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

import { Connection, NamedPackageDir, SfError, SfProject } from '@salesforce/core';
import { MockTestOrgData, TestContext } from '@salesforce/core/testSetup';
import { Package, PackageVersionListResult } from '@salesforce/packaging';
import { expect } from 'chai';
import PackageDependenciesManage from '../../../../../src/commands/simply/package/dependencies/manage.js';

const mockPackage2Id = '0Hot0000000YzlxBAB';

const mockVersion100: PackageVersionListResult = {
  Id: 'id-100',
  Package2Id: mockPackage2Id,
  SubscriberPackageVersionId: '04t100000000000AAA',
  Name: 'v1.0.0.1',
  // @ts-ignore
  Package2: { Name: 'MyPackage', NamespacePrefix: '' },
  Description: '',
  Tag: '',
  Branch: '',
  MajorVersion: '1',
  MinorVersion: '0',
  PatchVersion: '0',
  BuildNumber: '1',
  IsReleased: true,
  CreatedDate: '2024-01-01',
  LastModifiedDate: '2024-01-01',
  IsPasswordProtected: false,
  AncestorId: '',
  ValidationSkipped: false,
  CreatedById: '',
  // @ts-ignore
  CodeCoverage: undefined,
  HasPassedCodeCoverageCheck: true,
  ConvertedFromVersionId: '',
  ReleaseVersion: '',
  BuildDurationInSeconds: 60,
  HasMetadataRemoved: false,
  Language: '',
};

const mockVersion101: PackageVersionListResult = {
  ...mockVersion100,
  Id: 'id-101',
  SubscriberPackageVersionId: '04t100000000001AAA',
  Name: 'v1.0.1.1',
  MajorVersion: '1',
  MinorVersion: '0',
  PatchVersion: '1',
  BuildNumber: '1',
  IsReleased: false,
};

// Typed package directory mock. Must have a `package` property so isNamedPackagingDirectory returns true.
const mockPackageDirectories = [
  {
    path: 'force-app',
    name: 'force-app',
    fullPath: '/test/force-app',
    default: true,
    package: 'MyProject',
    versionNumber: '1.0.0.NEXT',
    dependencies: [{ package: mockVersion100.SubscriberPackageVersionId }],
  },
] as unknown as NamedPackageDir[];

// Minimal sfdx-project.json contents — only needed for findAlias and applyChanges.
const mockProjectContents = {
  packageDirectories: [
    {
      path: 'force-app',
      default: true,
      dependencies: [{ package: mockVersion100.SubscriberPackageVersionId }],
    },
  ],
  packageAliases: {
    MyPackage: mockPackage2Id,
    'MyPackage@1.0.0-1': mockVersion100.SubscriberPackageVersionId,
  },
  namespace: '',
  sourceApiVersion: '62.0',
};

function buildMockProjectJson(contents = mockProjectContents) {
  return {
    getContents: () => contents,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
    set: (_key: string, _value: any) => {},
    write: async () => contents,
  };
}

describe('simply package dependencies manage', () => {
  const $$ = new TestContext();
  const testOrg = new MockTestOrgData();
  testOrg.isDevHub = true;

  before(async () => {
    await $$.stubAuths(testOrg);
  });

  afterEach(() => {
    $$.restore();
  });

  it('should error without required --target-dev-hub flag', async () => {
    try {
      await PackageDependenciesManage.run();
      expect.fail('should have thrown NoDefaultDevHubError');
    } catch (err) {
      const error = err as SfError;
      expect(error.name).to.equal('NoDefaultDevHubError');
      expect(error.message).to.include('No default dev hub found.');
    }
  });

  it('should auto-select latest released version with --update-to-released', async () => {
    const autoFetchQueryStub = $$.SANDBOX.stub(Connection.prototype, 'autoFetchQuery');
    autoFetchQueryStub
      .onFirstCall()
      .resolves({ records: [{ Package2Id: mockPackage2Id }], totalSize: 1, done: true } as never);
    autoFetchQueryStub.onSecondCall().resolves({ records: [], totalSize: 0, done: true } as never);
    $$.SANDBOX.stub(Package, 'listVersions').resolves([mockVersion100, mockVersion101]);
    $$.SANDBOX.stub(SfProject.prototype, 'getPackageDirectories').returns(mockPackageDirectories);
    $$.SANDBOX.stub(SfProject.prototype, 'retrieveSfProjectJson').resolves(buildMockProjectJson() as never);

    const results = await PackageDependenciesManage.run(['--target-dev-hub', testOrg.username, '--update-to-released']);

    expect(results).to.have.length(1);
    expect(results[0].packageDirectory).to.equal('force-app');
    // Released version is 1.0.0-1 → isSameAsOld because current IS the released version
    expect(results[0].changes[0].newAlias).to.include('1.0.0-1');
  });

  it('should auto-select non-pinned latest with --update-to-latest', async () => {
    const autoFetchQueryStub = $$.SANDBOX.stub(Connection.prototype, 'autoFetchQuery');
    autoFetchQueryStub
      .onFirstCall()
      .resolves({ records: [{ Package2Id: mockPackage2Id }], totalSize: 1, done: true } as never);
    autoFetchQueryStub.onSecondCall().resolves({ records: [], totalSize: 0, done: true } as never);
    $$.SANDBOX.stub(Package, 'listVersions').resolves([mockVersion100, mockVersion101]);
    $$.SANDBOX.stub(SfProject.prototype, 'getPackageDirectories').returns(mockPackageDirectories);
    $$.SANDBOX.stub(SfProject.prototype, 'retrieveSfProjectJson').resolves(buildMockProjectJson() as never);

    const results = await PackageDependenciesManage.run(['--target-dev-hub', testOrg.username, '--update-to-latest']);

    expect(results).to.have.length(1);
    expect(results[0].changes[0].newAlias).to.include('LATEST');
    expect(results[0].changes[0].changed).to.equal(true);
  });

  it('should prompt user in interactive mode and apply selection', async () => {
    const autoFetchQueryStub = $$.SANDBOX.stub(Connection.prototype, 'autoFetchQuery');
    autoFetchQueryStub
      .onFirstCall()
      .resolves({ records: [{ Package2Id: mockPackage2Id }], totalSize: 1, done: true } as never);
    autoFetchQueryStub.onSecondCall().resolves({ records: [], totalSize: 0, done: true } as never);
    $$.SANDBOX.stub(Package, 'listVersions').resolves([mockVersion100, mockVersion101]);
    $$.SANDBOX.stub(SfProject.prototype, 'getPackageDirectories').returns(mockPackageDirectories);
    $$.SANDBOX.stub(SfProject.prototype, 'retrieveSfProjectJson').resolves(buildMockProjectJson() as never);
    // Simulate user picking the 1.0.1-1 version (stub prototype method to avoid ESM restriction)
    $$.SANDBOX.stub(PackageDependenciesManage.prototype, 'promptForVersion' as never).resolves(
      mockVersion101.SubscriberPackageVersionId
    );

    const results = await PackageDependenciesManage.run(['--target-dev-hub', testOrg.username]);

    expect(results).to.have.length(1);
    expect(results[0].changes[0].newAlias).to.include('1.0.1-1');
    expect(results[0].changes[0].changed).to.equal(true);
  });

  it('should skip and mark unchanged when dev hub has no versions', async () => {
    const autoFetchQueryStub = $$.SANDBOX.stub(Connection.prototype, 'autoFetchQuery');
    autoFetchQueryStub
      .onFirstCall()
      .resolves({ records: [{ Package2Id: mockPackage2Id }], totalSize: 1, done: true } as never);
    autoFetchQueryStub.onSecondCall().resolves({ records: [], totalSize: 0, done: true } as never);
    $$.SANDBOX.stub(Package, 'listVersions').resolves([]);
    $$.SANDBOX.stub(SfProject.prototype, 'getPackageDirectories').returns(mockPackageDirectories);
    $$.SANDBOX.stub(SfProject.prototype, 'retrieveSfProjectJson').resolves(buildMockProjectJson() as never);

    const results = await PackageDependenciesManage.run(['--target-dev-hub', testOrg.username, '--update-to-released']);

    expect(results).to.have.length(1);
    expect(results[0].changes[0].changed).to.equal(false);
  });
});
