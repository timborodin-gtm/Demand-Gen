# LinkedIn API Fixtures

These fixtures are sanitized, docs-shaped LinkedIn Marketing API responses for Connected Mode tests. They are not live account exports.

The set covers the first V1 connected pull:

- ad accounts
- campaign groups
- campaigns
- creatives
- ad analytics
- lead forms
- Lead Sync denied response

The important behavior is the access split: lead forms can be readable through the advertising surface while lead form responses can still be denied by Lead Sync permissions.
