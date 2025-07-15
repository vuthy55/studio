
# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

## Firebase Storage CORS Configuration

If you are experiencing CORS errors when trying to upload files to Firebase Storage, you need to update the CORS configuration for your storage bucket. This happens because, for security, browsers block requests from your web app's domain to the Firebase Storage domain unless Storage explicitly allows it.

The error `NotFoundException: 404 The specified bucket does not exist` means the bucket name in the command is incorrect. Follow these steps to find the correct name and apply the settings.

### Step 1: Find Your Correct Bucket Name

Run the following command in your terminal. This will list all the storage buckets in your project.

```bash
gcloud storage buckets list
```

You should see output that includes a `storage_url`. Copy the URL that starts with `gs://`. For example:

```
storage_url: gs://your-project-name.firebasestorage.app/
```

### Step 2: Apply the CORS Configuration

Now, use the bucket URL you found in Step 1 to run the final command. For example, if your bucket URL was `gs://trans3-92849.firebasestorage.app/`, you would run:

```bash
gsutil cors set workspace/cors.json gs://trans3-92849.firebasestorage.app
```

This command uses the correct bucket name and points to the `workspace/cors.json` file provided in this project. This will apply the necessary rules to your bucket and should permanently resolve the upload errors.
