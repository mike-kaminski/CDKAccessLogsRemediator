import { App, Tags } from "aws-cdk-lib";
import { LogStack } from "./LogStack";
import { BuildConfig } from "./BuildConfig";

const app = new App();

// Some helper functions for type enforcement
function verifyString(
  object: { [name: string]: any },
  propName: string
): string {
  if (!object[propName] || object[propName].trim().length === 0)
    throw new Error(propName + " does not exist or is empty.");

  return object[propName];
}

function verifyNumber(
  object: { [name: string]: number },
  propName: string
): number {
  if (typeof object[propName] != "number")
    throw new Error(propName + " does not exist or is empty.");

  return object[propName];
}

// Load config function
function loadConfig() {
  let env = app.node.tryGetContext("config");
  if (!env)
    throw new Error(
      "Context variable missing on CDK command. Pass in as `-c config=<env>`"
    );

  let unparsedEnv = app.node.tryGetContext(env);

  let buildConfig: BuildConfig = {
    Product: verifyString(unparsedEnv, "Product"),
    AWSAccountID: verifyString(unparsedEnv, "AWSAccountID"),
    AWSRegion: verifyString(unparsedEnv, "AWSRegion"),
    Environment: verifyString(unparsedEnv, "Environment"),
    Team: verifyString(unparsedEnv, "Team"),
    Version: verifyString(unparsedEnv, "Version"),
    ElbAccountId: verifyString(unparsedEnv, "ElbAccountId"),
    LogRetentionDays: verifyNumber(unparsedEnv, "LogRetentionDays"),
  };

  return buildConfig;
}

// Main stack build function
async function Main(): Promise<LogStack> {
  let buildConfig: BuildConfig = loadConfig();

  Tags.of(app).add("Product", buildConfig.Product);
  Tags.of(app).add("Environment", buildConfig.Environment);
  Tags.of(app).add("Team", buildConfig.Team);

  let logStackName = buildConfig.Product + buildConfig.Environment;
  const logStack = new LogStack(
    app,
    logStackName,
    {
      env: {
        region: buildConfig.AWSRegion,
        account: buildConfig.AWSAccountID,
      },
    },
    buildConfig
  );

  return logStack;
}
Main();
