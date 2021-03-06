/* eslint-disable no-new */
import * as path from "path";

import * as cdk from "@aws-cdk/cdk";
import * as cloudfront from "@aws-cdk/aws-cloudfront";
import * as lambda from "@aws-cdk/aws-lambda";
import * as s3 from "@aws-cdk/aws-s3";

export default class NgsUsEast1Stack extends cdk.Stack {
  // eslint-disable-next-line no-useless-constructor
  public constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // viewer-request triggered
    new lambda.Function(this, "NgsViewerRequestFunc", {
      code: lambda.Code.directory(path.join(__dirname, "..", "..", "aws-lambda-edge-viewer-request/lib")),
      handler: "index.handler",
      memorySize: 128,
      runtime: lambda.Runtime.NodeJS810,
      timeout: 1
    });

    // origin-response triggers
    const originResponseFunc = new lambda.Function(this, "NgsOriginResponseFunc", {
      code: lambda.Code.directory(path.join(__dirname, "..", "..", "aws-lambda-edge-origin-response/lib")),
      handler: "index.handler",
      memorySize: 256,
      runtime: lambda.Runtime.NodeJS810,
      timeout: 30
    });

    // #region CloudFront
    const cfProps: cloudfront.CloudFrontWebDistributionProps = {
      aliasConfiguration: {
        acmCertRef: process.env.AWS_ACM_CERTIFICATE_ARN as string,
        names: [process.env.AWS_CLOUDFRONT_ALIAS_NAME as string],
        sslMethod: cloudfront.SSLMethod.SNI,
        securityPolicy: cloudfront.SecurityPolicyProtocol.TLSv1_2_2018
      },
      defaultRootObject: "/index.html",
      originConfigs: [],
      priceClass: cloudfront.PriceClass.PriceClass200
    };

    if (process.env.AWS_S3_BACKEND_BUCKET_NAME) {
      // import exists bucket from domain name
      const bucket = s3.Bucket.import(this, `NgsS3BackendSource`, { bucketArn: `arn:aws:s3:::${process.env.AWS_S3_BACKEND_BUCKET_NAME}` });
      bucket.grantRead(originResponseFunc);

      // create a origin access identity for bucket access
      const originAccessIdentity = new cloudfront.CfnCloudFrontOriginAccessIdentity(this, `S3OriginAccessIdentity`, {
        cloudFrontOriginAccessIdentityConfig: {
          comment: `access-identity-${process.env.AWS_S3_BACKEND_BUCKET_NAME}.s3.amazonaws.com`
        }
      });

      cfProps.originConfigs.push({
        behaviors: [
          {
            allowedMethods: cloudfront.CloudFrontAllowedMethods.GET_HEAD,
            isDefaultBehavior: true,
            defaultTtlSeconds: 86400 * 30, // 1 month
            minTtlSeconds: 86400 // 24 hours
          }
        ],
        s3OriginSource: {
          originAccessIdentity,
          s3BucketSource: bucket
        }
      });
    } else if (process.env.AWS_HTTPS_BACKEND_DOMAIN) {
      cfProps.originConfigs.push({
        behaviors: [
          {
            allowedMethods: cloudfront.CloudFrontAllowedMethods.GET_HEAD,
            isDefaultBehavior: true,
            defaultTtlSeconds: 86400 * 30, // 1 month
            minTtlSeconds: 86400 // 24 hours
          }
        ],
        customOriginSource: {
          domainName: process.env.AWS_HTTPS_BACKEND_DOMAIN as string
        }
      });
    } else {
      throw new Error("You must set AWS_S3_BACKEND_BUCKET_NAME or AWS_HTTPS_BACKEND_DOMAIN");
    }

    // Should I use cloudfront.CfnDistribution ...?
    new cloudfront.CloudFrontWebDistribution(this, "NgsCloudFront", cfProps);

    // #endregion
  }
}
