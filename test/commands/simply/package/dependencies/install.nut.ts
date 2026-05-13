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


import path from 'node:path';
import { expect } from 'chai';
import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { Duration } from '@salesforce/kit';
import { PackageToInstall } from './../../../../../src/commands/simply/package/dependencies/install.js';

describe('simply package dependencies install - standard', () => {
  let session: TestSession;

  before(async () => {
    session = await TestSession.create({
      devhubAuthStrategy: 'AUTO',
      project: {
        sourceDir: path.join(process.cwd(), 'test/reference-projects/standard-project'),
      },
      scratchOrgs: [
        {
          setDefault: true,
          config: path.join('config', 'project-scratch-def.json'),
        },
      ],
    });
  });

  it('should install package dependencies with stdout', () => {
    const username = [...session.orgs.keys()][0];
    const command = `simply package dependencies install --install-type All --target-org ${username} --no-prompt`;
    const output = execCmd(command, { ensureExitCode: 0, timeout: Duration.minutes(30).milliseconds });
    const stdout = output?.shellOutput?.stdout;

    expect(stdout).to.contain('Installing package ESObjects@57.0.0-3... done');
    expect(stdout).to.contain('Installing package ESBaseCodeLWC@57.0.0-2... done');
    expect(stdout).to.contain('Installing package ESBaseStylesLWC@57.0.0-2... done');
  });

  it('should install package dependencies with json', () => {
    const username = [...session.orgs.keys()][0];
    const command = `simply package dependencies install --install-type All --target-org ${username} --no-prompt --json`;
    const output = execCmd<PackageToInstall[]>(command, {
      ensureExitCode: 0,
      timeout: Duration.minutes(30).milliseconds,
    }).jsonOutput;

    expect(output!.result[0].PackageName).contains('ESObjects');
    expect(output!.result[1].PackageName).contains('ESBaseCodeLWC');
    expect(output!.result[2].PackageName).contains('ESBaseStylesLWC');
  });

  it('should skip installed packages with stdout', () => {
    const username = [...session.orgs.keys()][0];
    const command = `simply package dependencies install --install-type Delta --target-org ${username} --no-prompt`;
    const output = execCmd(command, { ensureExitCode: 0, timeout: Duration.minutes(30).milliseconds });
    const stdout = output?.shellOutput?.stdout;

    expect(stdout).to.contain(
      'Package ESObjects@57.0.0-3 (04t4W000002nizdQAA) is already installed and will be skipped'
    );
    expect(stdout).to.contain(
      'Package ESBaseCodeLWC@57.0.0-2 (04t4W000002niziQAA) is already installed and will be skipped'
    );
    expect(stdout).to.contain(
      'Package ESBaseStylesLWC@57.0.0-2 (04t4W000002niznQAA) is already installed and will be skipped'
    );
  });

  it('should skip installed packages with json', () => {
    const username = [...session.orgs.keys()][0];
    const command = `simply package dependencies install --install-type Delta --target-org ${username} --no-prompt --json`;
    const output = execCmd<PackageToInstall[]>(command, {
      ensureExitCode: 0,
      timeout: Duration.minutes(30).milliseconds,
    }).jsonOutput;

    expect(output!.result[0].Status).equals('Skipped');
    expect(output!.result[1].Status).equals('Skipped');
    expect(output!.result[2].Status).equals('Skipped');
  });

  after(async () => {
    await session?.clean();
  });
});

describe('simply package dependencies install - package', () => {
  let session: TestSession;

  before(async () => {
    session = await TestSession.create({
      devhubAuthStrategy: 'AUTO',
      project: {
        sourceDir: path.join(process.cwd(), 'test/reference-projects/package-project'),
      },
      scratchOrgs: [
        {
          setDefault: true,
          config: path.join('config', 'project-scratch-def.json'),
        },
      ],
    });
  });

  it('should install package dependencies with stdout', () => {
    const username = [...session.orgs.keys()][0];
    const command = `simply package dependencies install --install-type All --target-org ${username} --no-prompt`;
    const output = execCmd(command, { ensureExitCode: 0, timeout: Duration.minutes(30).milliseconds });
    const stdout = output?.shellOutput?.stdout;

    expect(stdout).to.contain('Installing package ESObjects@57.0.0-3... done');
    expect(stdout).to.contain('Installing package ESBaseCodeLWC@57.0.0-2... done');
    expect(stdout).to.contain('Installing package ESBaseStylesLWC@57.0.0-2... done');
  });

  it('should install package dependencies with json', () => {
    const username = [...session.orgs.keys()][0];
    const command = `simply package dependencies install --install-type All --target-org ${username} --no-prompt --json`;
    const output = execCmd<PackageToInstall[]>(command, {
      ensureExitCode: 0,
      timeout: Duration.minutes(30).milliseconds,
    }).jsonOutput;

    expect(output!.result[0].PackageName).contains('ESObjects');
    expect(output!.result[1].PackageName).contains('ESBaseCodeLWC');
    expect(output!.result[2].PackageName).contains('ESBaseStylesLWC');
  });

  it('should skip installed packages with stdout', () => {
    const username = [...session.orgs.keys()][0];
    const command = `simply package dependencies install --install-type Delta --target-org ${username} --no-prompt`;
    const output = execCmd(command, { ensureExitCode: 0, timeout: Duration.minutes(30).milliseconds });
    const stdout = output?.shellOutput?.stdout;

    expect(stdout).to.contain(
      'Package ESObjects@57.0.0-3 (04t4W000002nizdQAA) is already installed and will be skipped'
    );
    expect(stdout).to.contain(
      'Package ESBaseCodeLWC@57.0.0-2 (04t4W000002niziQAA) is already installed and will be skipped'
    );
    expect(stdout).to.contain(
      'Package ESBaseStylesLWC@57.0.0-2 (04t4W000002niznQAA) is already installed and will be skipped'
    );
  });

  it('should skip installed packages with json', () => {
    const username = [...session.orgs.keys()][0];
    const command = `simply package dependencies install --install-type Delta --target-org ${username} --no-prompt --json`;
    const output = execCmd<PackageToInstall[]>(command, {
      ensureExitCode: 0,
      timeout: Duration.minutes(30).milliseconds,
    }).jsonOutput;

    expect(output!.result[0].Status).equals('Skipped');
    expect(output!.result[1].Status).equals('Skipped');
    expect(output!.result[2].Status).equals('Skipped');
  });

  after(async () => {
    await session?.clean();
  });
});
