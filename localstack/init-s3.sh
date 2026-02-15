#!/bin/bash
awslocal s3 mb s3://maycast-recordings
echo "✅ S3 bucket 'maycast-recordings' created"

# ブラウザからのPresigned URL直接アップロードに必要なCORS設定
awslocal s3api put-bucket-cors --bucket maycast-recordings --cors-configuration '{
  "CORSRules": [
    {
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["GET", "PUT", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3600
    }
  ]
}'
echo "✅ CORS configuration applied to 'maycast-recordings'"
