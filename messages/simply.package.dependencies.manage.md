# summary

Manage package dependency versions for a Salesforce project.

# description

Interactively updates package dependency versions in sfdx-project.json by querying the Dev Hub for available versions. Supports interactive selection or automatic update to the latest released or latest build version.

Project-level configuration (in sfdx-project.json) is read from the following keys:

- plugins.simply.dependencies.ignore — array of Package2Ids or aliases to leave unchanged
- plugins.simply.package.brancheswithreleasedversions — array of branch names that contain released versions

# flags.branch.summary

Package branch to consider when evaluating version options.

# flags.branch.description

When specified, the command will include the latest build on this branch as a selectable option for each dependency.

# flags.update-to-released.summary

Automatically update all dependencies to the latest released version.

# flags.update-to-released.description

When specified, all dependencies managed by the Dev Hub are automatically updated to the latest released package version without interactive prompts. Mutually exclusive with --update-to-latest.

# flags.update-to-latest.summary

Automatically set all dependencies to the latest non-pinned build.

# flags.update-to-latest.description

When specified, all dependencies managed by the Dev Hub are automatically set to a non-pinned X.Y.Z.LATEST version number without interactive prompts. Mutually exclusive with --update-to-released.

# examples

- <%= config.bin %> <%= command.id %> --target-dev-hub myDevHub

- <%= config.bin %> <%= command.id %> --target-dev-hub myDevHub --branch my-feature-branch

- <%= config.bin %> <%= command.id %> --target-dev-hub myDevHub --update-to-released

- <%= config.bin %> <%= command.id %> --target-dev-hub myDevHub --update-to-latest

# info.loadingDevHubData

Loading package information from Dev Hub...

# info.analyzingDependencies

Analyzing project dependencies...

# info.reviewingDependency

Preparing options for dependency '%s'

# info.dependencyNotManagedByDevHub

The dependency '%s' is not managed by this Dev Hub. Skipping.

# info.noAlternatesFound

No alternate version options found for '%s'.

# info.versionSelected

%s version selected: %s

# info.versionIgnored

%s version is ignored (no change applied).

# prompt.selectVersion

Which version of package '%s' should be used?

# errors.connectionFailed

Unable to establish connection to the Dev Hub org.

# errors.noProjectDependencies

No package dependencies with dev hub-managed packages were found in sfdx-project.json.
