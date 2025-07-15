
# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

## Firebase Storage CORS Configuration

If you are experiencing CORS errors when trying to upload files to Firebase Storage, you need to update the CORS configuration for your storage bucket.

1.  **Get your Project ID:** Find your Firebase Project ID. It's visible in your Firebase project settings. Let's assume it's `YOUR_PROJECT_ID`. Your storage bucket URL will be `gs://YOUR_PROJECT_ID.appspot.com`.

2.  **Apply CORS settings:** Open a terminal in the root directory of this project. Run the following command, replacing `YOUR_PROJECT_ID` with your actual project ID:

    ```bash
    gsutil cors set workspace/cors.json gs://YOUR_PROJECT_ID.appspot.com
    ```
    
    If you are using the default project configured with gcloud, you can get the project ID with `gcloud config get-value project` and then run:
    ```bash
    gsutil cors set workspace/cors.json gs://$(gcloud config get-value project).appspot.com
    ```

This command now correctly points to `workspace/cors.json` and will apply the rules to your bucket, allowing uploads from your app and fixing the error.
