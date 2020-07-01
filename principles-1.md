# Principles

### Easy to Replace

sfpowerscripts will strive to keep the tasks as granular as possible, thus enabling the pipeline author to replace tasks with ease. A pipeline author should be able to utilize any in place replacement for any tasks provided through the extension.

For eg: sfpowerscripts provides a task to create a new version unlocked package, This task can be replaced by the following shell script

```text
#assuming packageName is passed as the parameter
pkg_output=`sfdx force:package:version:create -p "$(packageName)" -x -w 180 --definitionfile config/project-scratch-def.json  --json`

 echo ${pkg_output}
  
  PACKAGE_STATUS=`echo ${pkg_output} | jq '.status' -r`
  if [ ${PACKAGE_STATUS} = "1" ]; then
    ERROR_TYPE=`echo ${pkg_output} | jq '.name' -r`
    echo Found $ERROR_TYPE
   if [ -z  ${ERROR_TYPE}]; then
      echo "Packaging failed"
      echo ${pkg_output} | python3 -m json.tool
      exit 1
    fi
  else
     echo "Successfull Packaging"
     echo ${pkg_output} | python3 -m json.tool
     PACKAGE_VERSION_ID=`echo ${pkg_output} | jq '.result.SubscriberPackageVersionId' -r`
     break
  fi
 # In a subsequent task either use the PAKAGE_VERSION_ID or write to a file as a build artifact
```

That being said we are monitoring the need for further use cases for higher level abstractions, such as a consolidated task executor command \(Refer to Issue [68](https://github.com/Accenture/sfpowerscripts/issues/68) \), such commands will always be optional and will not feature in the sample pipelines

### Generate Artifacts on Build Stage

sfpowerscripts \(cli/azure pipelines\) is built on the concept of generating artifacts for all kinds of package creation tasks, irrespective whether its unlocked or not, which then could be versioned, uploaded into an artifact provider or utilized in subsequent stages for deployment orchestration. 

The following package creation commands outlines this concept in action

* Create Source Package
* Create Unlocked Package
* Create Delta Package

These tasks should be invoked on a build stage \( when a feature branch merges into a integration branch\).   We also provide tasks such as Create Source Package \( for projects which do not use an unlocked package\) to produce these artifacts.

![Use of artifacts across different stages](.gitbook/assets/build-deploy.png)

These commands create an JSON based artifact with format `<package-name>_artifact_metadata` . We plan to extend this schema with more metadata as applicable in the future.

```text
#sample artifact schema for unlocked package produced by Create Unlocked Package

{
  "package_name": "async-framework",
  "package_version_number": "0.1.0.80",
  "package_version_id": "04t1P000000IwtzQAC",
  "sourceVersion": "1815441c8196cadbc68cbf261b57e75165a8cd5d",
  "repository_url": "https://github.com/XXXXXX/yyyyyyyyy",
  "package_type": "unlocked",
  "test_coverage": 0,
  "has_passed_coverage_check": false,
}

```

The above JSON based schema is written to a file and is then treated as the build output a \(In the case of azure pipelines, there are options build artifact\) and could be uploaded to an artifact provider such as Azure Artifact.




