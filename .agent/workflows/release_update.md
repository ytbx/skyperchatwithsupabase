---
description: How to release a new version of the application for auto-updates
---

# Release Process

Follow these steps to release a new version of the application. This will trigger the auto-update mechanism for existing users.

## 1. Update Version

Open `package.json` and increment the `version` field.
Example: Change `0.0.0` to `0.0.1`.

```json
{
  "name": "ovox",
  "version": "0.0.1", 
  ...
}
```

## 2. Build the Application

Run the following command in your terminal to build the application and generate the installer/executables.

```bash
npm run electron:build
```

This will create a `release` folder in your project directory containing:
- `Ovox Setup <version>.exe`
- `latest.yml`
- `Ovox Setup <version>.exe.blockmap`

## 3. Create GitHub Release

1.  Go to your GitHub repository: https://github.com/yusuf/ovox
2.  Click on **Releases** (usually on the right sidebar).
3.  Click **Draft a new release**.
4.  **Tag version**: Enter the version number you set in `package.json` (e.g., `v0.0.1`).
5.  **Release title**: Enter the same version number (e.g., `v0.0.1`).
6.  **Description**: Describe the changes in this update.

## 4. Upload Assets

Drag and drop the following files from your local `release` folder into the "Attach binaries by dropping them here or selecting them" area:

1.  `Ovox Setup <version>.exe`
2.  `latest.yml` (CRITICAL for auto-updates)
3.  `Ovox Setup <version>.exe.blockmap`

## 5. Publish

Click **Publish release**.

## 6. Verify

Users opening the application should now detect the update and download it automatically.
