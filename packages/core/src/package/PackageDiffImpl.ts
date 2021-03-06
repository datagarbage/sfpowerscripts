import ignore from "ignore";
const fs = require("fs");
import { isNullOrUndefined } from "util";
const path = require("path");
import simplegit, { SimpleGit } from "simple-git/promise";
import { exec } from "shelljs";
import SFPLogger from "../utils/SFPLogger";

export default class PackageDiffImpl {
  public constructor(
    private sfdx_package: string,
    private project_directory: string,
    private config_file_path?: string
  ) {}

  public async exec(): Promise<boolean> {
    let git: SimpleGit;

    let config_file_path: string = this.config_file_path;

    let project_config_path: string;
    if (!isNullOrUndefined(this.project_directory)) {
      project_config_path = path.join(
        this.project_directory,
        "sfdx-project.json"
      );
      git = simplegit(this.project_directory);
      SFPLogger.log(`Project directory being analysed ${this.project_directory}`);
    } else {
      project_config_path = "sfdx-project.json";
      git = simplegit();
      SFPLogger.log(`Project directory being analysed ${process.cwd()}`);
    }

    let project_json = JSON.parse(fs.readFileSync(project_config_path));

    for (let dir of project_json["packageDirectories"]) {
      if (this.sfdx_package == dir.package) {
        SFPLogger.log(
          `Checking last known tags for ${this.sfdx_package} to determine whether package is to be built...`
        );

        let tag = await this.getLatestTag(git, this.sfdx_package);

        if (tag) {
          SFPLogger.log(`\nUtilizing tag ${tag} for ${this.sfdx_package}`);

          // Get the list of modified files between the tag and HEAD refs
          let gitDiffResult: string = await git.diff([
            `${tag}`,
            `HEAD`,
            `--name-only`,
          ]);
          let modified_files: string[] = gitDiffResult.split("\n");
          modified_files.pop(); // Remove last empty element

          let forceignorePath: string;
          if (!isNullOrUndefined(this.project_directory))
            forceignorePath = path.join(this.project_directory, ".forceignore");
          else forceignorePath = ".forceignore";

          // Filter the list of modified files with .forceignore
          modified_files = ignore()
            .add(fs.readFileSync(forceignorePath).toString())
            .filter(modified_files);

          if (!isNullOrUndefined(config_file_path))
            SFPLogger.log(`Checking for changes to ${config_file_path}`);

          SFPLogger.log(`Checking for changes in source directory '${dir.path}'`);
          // From the filtered list of modified files, check whether the package has been modified
          for (let filename of modified_files) {
            if (
                filename.includes(`${dir.path}`) ||
                filename == config_file_path
            ) {
                SFPLogger.log(`Found change in ${filename}`);
                return true;
            }
          }

          SFPLogger.log(`Checking for changes to package version number in sfdx-project.json`);

          return await this.isPackageVersionChanged(
            git,
            tag,
            dir.versionNumber
          );
        } else {
          SFPLogger.log(
            `Tag missing for ${this.sfdx_package}...marking package for build anyways`
          );
          return true;
        }
      }
    }
    throw new Error(
      `Unable to find ${this.sfdx_package} in package directories`
    );
  }

  private async getLatestTag(git: any, sfdx_package: string): Promise<string> {
    let gitTagResult: string = await git.tag([
      `-l`,
      `${sfdx_package}_v*`,
      `--sort=version:refname`,
    ]);
    let tags: string[] = gitTagResult.split("\n");
    tags.pop(); // Remove last empty element

    let tagsPointingToBranch = await this.filterTagsAgainstBranch(
      git,
      sfdx_package,
      tags
    );
    SFPLogger.log("Analysing tags:");
    if (tagsPointingToBranch.length > 10) {
      SFPLogger.log(tagsPointingToBranch.slice(-10).toString().replace(/,/g, "\n"));
    } else {
      SFPLogger.log(tagsPointingToBranch.toString().replace(/,/g, "\n"));
    }

    let latestTag = tagsPointingToBranch.pop(); // Select latest tag
    return latestTag;
  }

  private async filterTagsAgainstBranch(
    git: any,
    sfdx_package: string,
    tags: string[]
  ): Promise<string[]> {
    // Get all the commit ID's (un-abbreviated) on the current branch
    let gitLogResult = await git.log([`--pretty=format:%H`]);
    let commits: string[] = gitLogResult["all"][0]["hash"].split("\n");

    // Get the tags' associated commit ID
    // Dereference (-d) tags into object IDs
    let gitShowRefTagsResult = exec(
      `git show-ref --tags -d | grep "${sfdx_package}_v*"`,
      { silent: true }
    )["stdout"];
    let refTags: string[] = gitShowRefTagsResult.split("\n");
    refTags.pop(); // Remove last empty element

    // Filter ref tags, only including tags that point to the branch
    // By checking whether all 40 digits in the tag commit ID matches an ID in the branch's commit log
    let refTagsPointingToBranch: string[] = refTags.filter((refTag) =>
      commits.includes(refTag.substr(0, 40))
    );
    // Only match the name of the tags pointing to the branch
    refTagsPointingToBranch = refTagsPointingToBranch.map(
      (refTagPointingToBranch) =>
        refTagPointingToBranch.match(/(?:refs\/tags\/)(.*)(?:\^{})$/)[1]
    );

    // Filter the sorted tags - only including tags that point to the branch
    let tagsPointingToBranch: string[] = tags.filter((tag) =>
      refTagsPointingToBranch.includes(tag)
    );

    return tagsPointingToBranch;
  }

  private async isPackageVersionChanged(
    git: any,
    latestTag: string,
    packageVersionHead: string
  ): Promise<boolean> {
    let project_config: string = await git.show([
      `${latestTag}:sfdx-project.json`,
    ]);
    let project_json = JSON.parse(project_config);

    let packageVersionLatestTag: string;
    for (let dir of project_json["packageDirectories"]) {
      if (this.sfdx_package == dir.package) {
        packageVersionLatestTag = dir.versionNumber;
      }
    }

    if ( packageVersionHead != packageVersionLatestTag) {
        SFPLogger.log(
            `Found change in package version number ${packageVersionLatestTag} -> ${packageVersionHead}`
        );
        return true;
    } else {
        return false;
    }
  }
}
