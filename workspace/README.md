
# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

## Firebase Storage CORS Configuration

If you are experiencing CORS errors when trying to upload files to Firebase Storage, you need to update the CORS configuration for your storage bucket. This happens because for security, browsers block requests from your web app's domain to the Firebase Storage domain unless Storage explicitly allows it.

### Why the command looks different

You might see your bucket name as `YOUR_PROJECT_ID.firebasestorage.app` in the Firebase console. However, when using the `gsutil` command-line tool, you must use the underlying Google Cloud Storage name, which is `gs://YOUR_PROJECT_ID.appspot.com`. This is the correct format for management commands.

### How to Fix It

1.  **Get your Project ID:** Find your Firebase Project ID. It's visible in your Firebase project settings. Let's assume it's `YOUR_PROJECT_ID`.

2.  **Apply CORS settings:** Open a terminal in the root directory of this project (where this `workspace` folder is). Run the following command, replacing `YOUR_PROJECT_ID` with your actual project ID:

    ```bash
    gsutil cors set workspace/cors.json gs://YOUR_PROJECT_ID.appspot.com
    ```
    
    For example, if your project ID is `trans3-92849`, the command would be:
    ```bash
    gsutil cors set workspace/cors.json gs://trans3-92849.appspot.com
    ```

This command correctly points to `workspace/cors.json` and will apply the rules to your bucket, allowing uploads from your app and fixing the error.

