# Microsoft Store Submission Guide

Complete guide for submitting Ovox to the Microsoft Store.

## Overview

This guide walks through the entire Microsoft Store submission process, from creating a Partner Center account to publishing your app.

## Prerequisites

- ✅ MSIX package built and tested locally
- ✅ Passed Windows App Certification Kit (WACK) tests
- ✅ Visual assets prepared (all required sizes)
- ✅ App screenshots and promotional materials
- ✅ Privacy policy URL (required for apps with network access)

## Step 1: Microsoft Partner Center Account

### Create Account

1. **Go to Microsoft Partner Center**:
   - Visit: https://partner.microsoft.com/dashboard
   - Click "Sign up"

2. **Choose Account Type**:
   - **Individual**: For personal developers ($19 one-time fee)
   - **Company**: For businesses ($99 one-time fee)

3. **Complete Registration**:
   - Provide payment information
   - Verify email address
   - Complete identity verification (may take 24-48 hours)

### Account Setup

1. **Set up payout account** (for paid apps or in-app purchases)
2. **Set up tax profile**
3. **Verify publisher identity**

## Step 2: Reserve App Name

### Reserve Your App Name

1. **Navigate to Partner Center Dashboard**
2. **Click "Create a new app"**
3. **Enter app name**: "Ovox"
4. **Check availability**
5. **Reserve name** (reserved for 3 months)

### Get App Identity

After reserving the name, you'll receive:

- **Package/Identity/Name**: e.g., `12345YourPublisher.Ovox`
- **Package/Identity/Publisher**: e.g., `CN=12345678-1234-1234-1234-123456789ABC`
- **Publisher Display Name**: Your registered publisher name

**IMPORTANT**: Save these values - you'll need them to update your package.json!

## Step 3: Update App Configuration

### Update package.json

Replace placeholder values in `package.json` with real values from Partner Center:

```json
"appx": {
  "identityName": "12345YourPublisher.Ovox",  // From Partner Center
  "publisher": "CN=12345678-1234-1234-1234-123456789ABC",  // From Partner Center
  "publisherDisplayName": "Your Real Publisher Name"  // From Partner Center
}
```

### Rebuild MSIX Package

```bash
pnpm run electron:build
```

### Re-run WACK Tests

After rebuilding with real identity, run WACK tests again to ensure everything still passes.

## Step 4: Prepare Store Listing

### Required Information

#### App Properties
- **Category**: Communication / Social
- **Subcategory**: Instant messaging
- **Privacy policy URL**: (required - must be publicly accessible)
- **Support contact info**: Email or website

#### Age Ratings
Complete the age rating questionnaire:
- Does your app contain violence? No
- Does your app contain sexual content? No
- Does your app allow communication with other users? **Yes**
- Does your app allow sharing of user location? No

Expected rating: **PEGI 3** or **ESRB Everyone**

#### Store Listings (English)

**Description** (10,000 character limit):
```
Ovox - Modern Voice & Text Chat

Connect with friends through crystal-clear voice calls, text messaging, and screen sharing.

KEY FEATURES:
• High-quality voice calls with advanced audio processing
• Real-time text messaging
• Screen sharing with system audio
• Voice channels for group communication
• Modern, intuitive interface
• Dark mode support

Perfect for gaming, remote work, or staying connected with friends and family.
```

**Short Description** (200 character limit):
```
Modern voice and text chat app with high-quality calls, screen sharing, and voice channels. Stay connected with friends effortlessly.
```

**Screenshots** (Required: 1-10 images):
- Minimum 1 screenshot
- Recommended: 4-8 screenshots showing key features
- Supported formats: PNG, JPEG
- Minimum resolution: 1366 x 768
- Show: Main chat interface, voice call, screen sharing, voice channels

**App Icon** (Store listing):
- Already configured in MSIX package
- Ensure it matches your visual identity

#### Additional Listings (Optional)
- Turkish (tr-TR) - Recommended since you support Turkish language
- Add localized descriptions and screenshots

### Privacy Policy

**Required** because your app:
- Accesses internet
- Allows user communication
- May collect user data (via Supabase)

Create a privacy policy covering:
- What data you collect (email, messages, voice data)
- How you use the data
- How you protect user data
- Third-party services (Supabase)
- User rights (data deletion, access)

Host it on:
- Your website
- GitHub Pages
- Privacy policy generators (e.g., termly.io, freeprivacypolicy.com)

## Step 5: Upload MSIX Package

### Package Upload

1. **Go to your app in Partner Center**
2. **Click "Start your submission"**
3. **Navigate to "Packages"**
4. **Upload your .appx file**:
   - Drag and drop `release/Ovox-0.8.7.appx`
   - Or click "Browse files"

5. **Wait for validation**:
   - Package will be scanned for issues
   - Check for errors or warnings
   - Fix any issues and re-upload if needed

### Package Details

The system will automatically extract:
- App version
- Supported architectures (x64)
- Supported Windows versions
- Required capabilities

Verify these are correct.

## Step 6: Complete Submission

### Pricing and Availability

- **Markets**: Select all markets or specific countries
- **Pricing**: Free (or set price)
- **Release date**: 
  - As soon as possible after certification
  - Or schedule a specific date

### App Declarations

Answer questions about your app:
- Does your app depend on non-Microsoft drivers? **No**
- Does your app require specific hardware? **No** (but microphone recommended)
- Does your app access personal information? **Yes** (for communication)

### Notes for Certification (Optional)

Provide testing instructions:
```
TESTING INSTRUCTIONS:

1. Create an account or sign in
2. Test voice call feature (requires microphone)
3. Test text messaging
4. Test screen sharing (requires another user or test account)

TEST ACCOUNT (if provided):
Email: test@example.com
Password: [provide test password]

NOTES:
- App uses Supabase for backend services
- Screen sharing includes system audio via native Windows API
- Voice channels require at least 2 users to test fully
```

## Step 7: Submit for Certification

### Final Checklist

- ✅ All required fields completed
- ✅ Screenshots uploaded
- ✅ Privacy policy URL provided
- ✅ MSIX package uploaded and validated
- ✅ Age rating completed
- ✅ Pricing and availability set

### Submit

1. **Review all sections** - ensure everything is complete
2. **Click "Submit to the Store"**
3. **Confirmation** - you'll receive a submission ID

## Step 8: Certification Process

### Timeline

- **Typical duration**: 24-48 hours
- **Can take up to**: 5 business days
- **Expedited review**: Not available for first submission

### Certification Steps

1. **Security tests** - Malware scanning
2. **Technical compliance** - WACK tests
3. **Content compliance** - Policy review
4. **Manual review** - Functionality testing

### Monitoring Status

Check status in Partner Center:
- **In progress**: Being reviewed
- **Pending release**: Passed, waiting to publish
- **In the Store**: Live!
- **Failed**: Issues found (see report)

### If Certification Fails

You'll receive a detailed report with:
- Specific issues found
- Steps to fix
- Relevant policy links

Common failure reasons:
- Privacy policy issues
- App crashes during testing
- Prohibited content
- Incomplete metadata

Fix issues and resubmit.

## Step 9: Post-Publication

### After App is Live

1. **Verify Store listing**:
   - Check app appears correctly
   - Test download and installation
   - Verify all features work

2. **Monitor reviews and ratings**:
   - Respond to user feedback
   - Address reported issues

3. **Analytics**:
   - Track downloads
   - Monitor usage statistics
   - Review crash reports

### Updating Your App

For future updates:

1. **Update version** in package.json
2. **Rebuild MSIX** package
3. **Test with WACK**
4. **Submit update** in Partner Center
5. **Provide update notes**

Updates typically certify faster (24 hours or less).

## Important Policies

### Microsoft Store Policies

Your app must comply with:
- **10.1 Distinct Function & Value**: App must be functional and provide value
- **10.2 Security**: No malware, secure data handling
- **10.5 Personal Information**: Proper privacy policy and data handling
- **10.13 Gaming and Xbox**: N/A for your app
- **10.14 Account Type**: Appropriate account type for app category

Full policies: https://docs.microsoft.com/windows/uwp/publish/store-policies

### Communication Apps Specific

- Must have clear privacy policy
- Must handle user data securely
- Should have reporting/blocking features (recommended)
- Must comply with local laws regarding communication

## Costs

- **Developer account**: $19 (individual) or $99 (company) - one-time
- **App submission**: Free
- **Updates**: Free
- **Microsoft takes**: 15% of revenue (if app is paid)

## Support and Resources

### Microsoft Resources
- **Partner Center Support**: https://partner.microsoft.com/support
- **Documentation**: https://docs.microsoft.com/windows/apps/publish/
- **Developer Forums**: https://docs.microsoft.com/answers/

### Ovox Specific
- **Build Guide**: See `MSIX_BUILD_GUIDE.md`
- **Asset Requirements**: See `build/appx-assets/README.md`

## Troubleshooting

### Common Issues

**"Package validation failed"**
- Re-run WACK tests locally
- Check package integrity
- Verify all required files are included

**"Privacy policy URL not accessible"**
- Ensure URL is publicly accessible
- Must be HTTPS
- Must load within 5 seconds

**"App crashes during certification"**
- Test thoroughly on clean Windows install
- Check for missing dependencies
- Review crash logs in Partner Center

**"Age rating incomplete"**
- Complete all questions in age rating questionnaire
- Be honest about app capabilities

## Next Steps

After successful publication:

1. **Promote your app**:
   - Share Store link
   - Social media announcement
   - Website integration

2. **Gather feedback**:
   - Monitor reviews
   - Engage with users
   - Plan improvements

3. **Plan updates**:
   - Bug fixes
   - New features
   - Performance improvements

Your Microsoft Store link will be:
`https://www.microsoft.com/store/apps/[your-app-id]`

Good luck with your submission! 🚀
