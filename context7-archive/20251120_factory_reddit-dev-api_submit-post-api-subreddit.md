---
query_date: 2025-11-20 08:38:08 UTC
library: /websites/reddit-dev-api
topic: submit post api subreddit
tokens: unknown
project: factory
tool: context7___get-library-docs
---

# Context7 Query: submit post api subreddit

### Submit Link Post - Bash

Source: https://context7.com/context7/reddit-dev-api/llms.txt

Submits a new link post to a specified subreddit. Requires an OAuth token and POST request with form data including subreddit, title, URL, and submission options. Returns JSON with post details.

```bash
curl -X POST \
     -H "Authorization: Bearer YOUR_OAUTH_TOKEN" \
     -d "sr=python&kind=link&title=Interesting%20Python%20Article&url=https://example.com/article&sendreplies=true&nsfw=false&spoiler=false" \
     https://oauth.reddit.com/api/submit
```

--------------------------------

### Submit Text Post with Flair - Bash

Source: https://context7.com/context7/reddit-dev-api/llms.txt

Submits a new text post to a specified subreddit, optionally with flair. Requires an OAuth token and POST request with form data. The `flair_id` parameter can be used to assign flair. Returns JSON with post details.

```bash
curl -X POST \
     -H "Authorization: Bearer YOUR_OAUTH_TOKEN" \
     -d "sr=programming&kind=self&title=How%20do%20I%20learn%20Rust&text=I%27m%20a%20Python%20developer...&flair_id=abc-def-123&sendreplies=true" \
     https://oauth.reddit.com/api/submit
```

--------------------------------

### Set Subreddit Sticky Post (API)

Source: https://context7.com/context7/reddit-dev-api/llms.txt

Sets a post to be sticky within a subreddit. Requires OAuth token, post ID, state (true/false), and position number.

```bash
curl -X POST \
     -H "Authorization: Bearer YOUR_OAUTH_TOKEN" \
     -d "id=t3_abc123&state=true&num=1" \
     https://oauth.reddit.com/api/set_subreddit_sticky
```

--------------------------------

### POST /api/submit

Source: https://www.reddit.com/dev/api/index

Submit a link to a subreddit. Submit will create a link or self-post in the subreddit `sr` with the title `title`. If `kind` is "link", then `url` is expected to be a valid URL to link to. Otherwise, `text`, if present, will be the body of the self-post unless `richtext_json` is present, in which case it will be converted into the body of the self-post. An error is thrown if both `text` and `richtext_json` are present. `extension` is used for determining which view-type (e.g. `json`, `compact` etc.) to use for the redirect that is generated after submit.

```APIDOC
## POST /api/submit

### Description
Submit a link to a subreddit.
Submit will create a link or self-post in the subreddit `sr` with the title `title`. If `kind` is "link", then `url` is expected to be a valid URL to link to. Otherwise, `text`, if present, will be the body of the self-post unless `richtext_json` is present, in which case it will be converted into the body of the self-post. An error is thrown if both `text` and `richtext_json` are present.
`extension` is used for determining which view-type (e.g. `json`, `compact` etc.) to use for the redirect that is generated after submit.

### Method
POST

### Endpoint
/api/submit

### Parameters
#### Request Body
- **ad** (boolean) - Optional - Boolean value
- **api_type** (string) - Required - The string `json`
- **app** (string) - Optional
- **collection_id** (string) - Optional - (beta) the UUID of a collection
- **extension** (string) - Optional - Extension used for redirects
- **flair_id** (string) - Optional - A string no longer than 36 characters
- **flair_text** (string) - Optional - A string no longer than 64 characters
- **g-recaptcha-response** (string) - Optional
- **kind** (string) - Required - One of (`link`, `self`, `image`, `video`, `videogif`)
- **nsfw** (boolean) - Optional - Boolean value
- **post_set_default_post_id** (string) - Optional
- **post_set_id** (string) - Optional
- **recaptcha_token** (string) - Optional
- **resubmit** (boolean) - Optional - Boolean value
- **richtext_json** (object) - Optional - JSON data
- **sendreplies** (boolean) - Optional - Boolean value
- **spoiler** (boolean) - Optional - Boolean value
- **sr** (string) - Required - Subreddit name
- **text** (string) - Optional - Raw markdown text
- **title** (string) - Required - Title of the submission. up to 300 characters long
- **X-Modhash** (string) - Required - A modhash header
- **url** (string) - Optional - A valid URL
- **video_poster_url** (string) - Optional - A valid URL
```

--------------------------------

### Get Hot Posts from a Subreddit using cURL

Source: https://context7.com/context7/reddit-dev-api/llms.txt

This snippet fetches the 'hot' posts from a specified subreddit using the Reddit API. It requires an OAuth token and allows for specifying the number of posts with the 'limit' parameter. The 'raw_json=1' parameter ensures a JSON response. The endpoint is /r/{subreddit}/hot.

```bash
curl -H "Authorization: Bearer YOUR_OAUTH_TOKEN" \
     "https://oauth.reddit.com/r/programming/hot?limit=25&raw_json=1"
```

--------------------------------

### POST /r/_subreddit_/api/widgetstructuredstyles

Source: https://www.reddit.com/dev/api/index

Add and return a widget to the specified subreddit. Accepts a JSON payload representing the widget data to be saved. The structure of the payload varies based on the 'kind' attribute.

```APIDOC
## POST /r/_subreddit_/api/widgetstructuredstyles

### Description
Add and return a widget to the specified subreddit. Accepts a JSON payload representing the widget data to be saved. Valid payloads differ in shape based on the "kind" attribute passed on the root object, which must be a valid widget kind.

### Method
POST

### Endpoint
`/r/_subreddit_/api/widgetstructuredstyles`

### Parameters
#### Request Body
- **kind** (string) - Required - One of the following widget kinds: `image`, `calendar`, `textarea`, `menu`, `button`, `community-list`, `custom`, `post-flair`.
- **shortName** (string) - Required - A string no longer than 30 characters.
- **styles** (object) - Optional - Styling options for the widget.
  - **backgroundColor** (string) - Optional - A 6-digit rgb hex color, e.g. `#AABBCC`.
  - **headerColor** (string) - Optional - A 6-digit rgb hex color, e.g. `#AABBCC`.

### Request Body Examples

**Image Widget:**
```json
{
  "data": [
    {
      "height": 100,
      "linkUrl": "http://example.com",
      "url": "https://www.reddit.com/media/image.jpg",
      "width": 100
    }
  ],
  "kind": "image",
  "shortName": "My Image Widget",
  "styles": {
    "backgroundColor": "#FFFFFF",
    "headerColor": "#000000"
  }
}
```

**Calendar Widget:**
```json
{
  "configuration": {
    "numEvents": 10,
    "showDate": true,
    "showDescription": false,
    "showLocation": true,
    "showTime": true,
    "showTitle": true
  },
  "googleCalendarId": "your-calendar-id@gmail.com",
  "kind": "calendar",
  "requiresSync": false,
  "shortName": "Upcoming Events",
  "styles": {
    "backgroundColor": "#F0F0F0",
    "headerColor": "#333333"
  }
}
```

**Textarea Widget:**
```json
{
  "kind": "textarea",
  "shortName": "About Section",
  "styles": {
    "backgroundColor": "#EEEEEE",
    "headerColor": "#111111"
  },
  "text": "# This is a **rich** text widget."
}
```

**Menu Widget:**
```json
{
  "data": [
    {
      "text": "Link 1",
      "url": "http://example.com/link1"
    },
    {
      "children": [
        {
          "text": "Sublink 1.1",
          "url": "http://example.com/link1.1"
        }
      ],
      "text": "Link 1 (Parent)"
    }
  ],
  "kind": "menu",
  "showWiki": false
}
```

**Button Widget:**
```json
{
  "buttons": [
    {
      "color": "#FFFFFF",
      "fillColor": "#0079D3",
      "hoverState": {
        "color": "#000000",
        "fillColor": "#0055A4",
        "kind": "text",
        "text": "Hover Text",
        "textColor": "#FFFFFF"
      },
      "kind": "text",
      "text": "Click Me",
      "textColor": "#FFFFFF",
      "url": "http://example.com"
    }
  ],
  "description": "A widget with a call to action button.",
  "kind": "button",
  "shortName": "Call to Action",
  "styles": {
    "backgroundColor": "#F5F5F5",
    "headerColor": "#0079D3"
  }
}
```

**Community List Widget:**
```json
{
  "data": [
    "subreddit1",
    "subreddit2"
  ],
  "kind": "community-list",
  "shortName": "Related Communities",
  "styles": {
    "backgroundColor": "#ECECEC",
    "headerColor": "#222222"
  }
}
```

**Custom Widget:**
```json
{
  "css": "body { background-color: #f0f0f0; }",
  "height": 300,
  "imageData": [
    {
      "height": 50,
      "name": "logo",
      "url": "https://www.reddit.com/media/custom_image.png",
      "width": 150
    }
  ],
  "kind": "custom",
  "shortName": "Custom HTML Widget",
  "styles": {
    "backgroundColor": "#FFFFFF",
    "headerColor": "#000000"
  },
  "text": "<h1>Welcome!</h1><p>This is custom content.</p>"
}
```

**Post Flair Widget:**
```json
{
  "display": "list",
  "kind": "post-flair",
  "order": [
    "flair_template_id_1",
    "flair_template_id_2"
  ],
  "shortName": "Filter by Flair",
  "styles": {
    "backgroundColor": "#EFEFEF",
    "headerColor": "#444444"
  }
}
```

### Response
#### Success Response (200)
- **widget** (object) - The newly added or updated widget object.

#### Response Example
```json
{
  "widget": {
    "id": "widget_id_123",
    "kind": "image",
    "shortName": "My Image Widget",
    "data": [
      {
        "height": 100,
        "url": "https://www.reddit.com/media/image.jpg",
        "width": 100
      }
    ],
    "styles": {
      "backgroundColor": "#FFFFFF",
      "headerColor": "#000000"
    }
  }
}
```
```

--------------------------------

### Subreddit Post Requirements API

Source: https://context7.com/context7/reddit-dev-api/llms.txt

Get the post requirements for a subreddit, including flair, title length, and blacklisted domains/strings.

```APIDOC
## GET /api/v1/{subreddit}/post_requirements

### Description
Retrieves the post requirements for a specified subreddit.

### Method
GET

### Endpoint
`/api/v1/{subreddit}/post_requirements`

### Parameters

#### Query Parameters
- **subreddit** (string) - Path - The name of the subreddit.

### Request Example
```bash
curl -H "Authorization: Bearer YOUR_OAUTH_TOKEN" \
     https://oauth.reddit.com/api/v1/programming/post_requirements
```

### Response
#### Success Response (200)
- **is_flair_required** (boolean) - Whether flair is required for posts.
- **title_text_min_length** (integer) - Minimum allowed length for post titles.
- **title_text_max_length** (integer) - Maximum allowed length for post titles.
- **body_restriction_policy** (string) - Policy for post body content (e.g., 'required').
- **domain_blacklist** (array) - List of blacklisted domains for posts.
- **title_blacklisted_strings** (array) - List of blacklisted strings for post titles.

#### Response Example
```json
{
  "is_flair_required": true,
  "title_text_min_length": 10,
  "title_text_max_length": 300,
  "body_restriction_policy": "required",
  "domain_blacklist": ["spam.com"],
  "title_blacklisted_strings": ["click here"]
}
```
```

--------------------------------

### POST /api/live/createsubmit

Source: https://www.reddit.com/dev/api/index

Creates a new live thread. Allows setting initial description, NSFW status, resources, and title.

```APIDOC
## POST /api/live/createsubmit

### Description
Creates a new live thread. After creation, the thread's settings can be modified using `/api/live/_thread_ /edit`, and new updates can be posted using `/api/live/_thread_ /update`.

### Method
POST

### Endpoint
`/api/live/createsubmit`

### Headers
- **X-Modhash** (string) - Required - Your Modhash token.

### Parameters
#### Request Body
- **api_type** (string) - Required - Must be the string `json`.
- **description** (string) - Required - Raw markdown text for the thread description.
- **nsfw** (boolean) - Required - A boolean value indicating if the thread is NSFW.
- **resources** (string) - Required - Raw markdown text for thread resources.
- **title** (string) - Required - A string no longer than 120 characters for the thread title.

### Request Example
```json
{
  "api_type": "json",
  "description": "Live updates from the event.",
  "nsfw": false,
  "resources": "[Link to official site](http://example.com)",
  "title": "Major Event Live Thread"
}
```

### Response
#### Success Response (200)
- **json** (object) - Contains the result of the creation operation.
  - **data** (object) - Details about the newly created live thread.
    - **id** (string) - The ID of the new live thread.
    - **name** (string) - The fullname of the new live thread.

#### Response Example
```json
{
  "json": {
    "data": {
      "id": "t16_examplethreadid",
      "name": "t16_examplethreadid",
      "errors": []
    }
  }
}
```
```

--------------------------------

### Get Hot Posts from Subreddit

Source: https://context7.com/context7/reddit-dev-api/llms.txt

Retrieves a list of the hottest posts in a specified subreddit.

```APIDOC
## Get Hot Posts from Subreddit

### Description
Retrieves a list of the hottest posts in a specified subreddit.

### Method
GET

### Endpoint
https://oauth.reddit.com/r/{subreddit}/hot

### Parameters
#### Query Parameters
- **limit** (integer) - Optional - The maximum number of items to return.
- **raw_json** (integer) - Optional - If set to 1, returns raw JSON.

### Request Example
```bash
curl -H "Authorization: Bearer YOUR_OAUTH_TOKEN" \
     "https://oauth.reddit.com/r/programming/hot?limit=25&raw_json=1"
```

### Response
#### Success Response (200)
- **kind** (string) - The type of object returned (e.g., "Listing").
- **data** (object) - Contains listing data.
  - **after** (string) - Token for the next page.
  - **dist** (integer) - Number of items in the current listing.
  - **children** (array) - Array of post objects.

#### Response Example
```json
{
  "kind": "Listing",
  "data": {
    "after": "t3_abc123",
    "dist": 25,
    "children": [
      {
        "kind": "t3",
        "data": {
          "id": "abc123",
          "name": "t3_abc123",
          "title": "Post title",
          "author": "username",
          "score": 1234,
          "num_comments": 56,
          "url": "https://...",
          "created_utc": 1234567890.0
        }
      }
    ]
  }
}
```
```

--------------------------------

### GET /r/_subreddit_/api/submit_text

Source: https://www.reddit.com/dev/api/index

Retrieves the submission text for a specific subreddit, which is set by moderators and intended for display on the submission form.

```APIDOC
## GET /r/_subreddit_/api/submit_text

### Description
Get the submission text for the subreddit. This text is set by the subreddit moderators and intended to be displayed on the submission form.

### Method
GET

### Endpoint
/r/_subreddit_/api/submit_text

### Parameters
#### Path Parameters
- **_subreddit_** (string) - Required - The name of the subreddit.

### Response
#### Success Response (200)
- **submit_text** (string) - The submission text for the subreddit.
```
