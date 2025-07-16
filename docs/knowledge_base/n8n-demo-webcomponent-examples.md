# n8n Demo Web Component - Examples

## Basic Example

Simple workflow preview without any additional features.

### HTML

```html
<n8n-demo workflow='{"nodes":[{"name":"Workflow-Created","type":"n8n-nodes-base.webhook","position":[512,369],"parameters":{"path":"webhook","httpMethod":"POST"},"typeVersion":1}],"connections":{}}'></n8n-demo>
```

### Features

- Minimal setup
- No frame or additional UI
- Interactive workflow canvas
- Basic webhook node example

## Frame Property Example

Complex workflow with frame enabled showing code and copy functionality.

### HTML

```html
<n8n-demo workflow='{"nodes":[{"parameters":{},"name":"Start","type":"n8n-nodes-base.start","typeVersion":1,"position":[250,300]},{"parameters":{"conditions":{"string":[{"value1":"=","operation":"notEqual","value2":"54iz37xumjg9ue6bo8ygqifb8y"}]}},"name":"IF","type":"n8n-nodes-base.if","typeVersion":1,"position":[650,300]},{"parameters":{},"name":"NoOp","type":"n8n-nodes-base.noOp","typeVersion":1,"position":[850,160]},{"parameters":{"authentication":"oAuth2","resource":"file","operation":"edit","owner":"mutdmour","repository":"=","filePath":"Dockerfile","fileContent":"=FROM node:14.16-alpine\n\n# pass N8N_VERSION Argument while building or use default\nARG N8N_VERSION=0.98.0\n\n# Update everything and install needed dependencies\nRUN apk add --update graphicsmagick tzdata\n\n# Set a custom user to not have n8n run as root\nUSER root\n\nRUN node --version\n\n# Install n8n and the also temporary all the packages\n# it needs to build it correctly.\nRUN apk --update add --virtual build-dependencies python2 python3 build-base && \\\n\tapk --update add git && \\\n\tapk del build-dependencies\n\nRUN N8N_CORE_BRANCH= && \\\n git clone https://github.com/n8n-io/n8n && \\\n\tcd n8n && \\\n echo $N8N_CORE_BRANCH && \\\n git fetch origin $N8N_CORE_BRANCH && \\\n git checkout $N8N_CORE_BRANCH && \\\n\tnpm install -g typescript && \\\n\tnpm install -g lerna && \\\n\tnpm install && \\\n\tlerna bootstrap --hoist && \\\n\tnpm_config_user=root npm run build \n\n# Specifying work directory\nWORKDIR /data\n\n# copy start script to container\nCOPY ./start.sh /\n\n# make the script executable\nRUN chmod +x /start.sh\n\n# define execution entrypoint\nCMD [\"/start.sh\"]","commitMessage":"=n8n bot - deploy branch "},"name":"GitHub","type":"n8n-nodes-base.github","typeVersion":1,"position":[1210,480],"credentials":{"githubOAuth2Api":{"id":"40","name":"Github account"}}},{"parameters":{"functionCode":"const responseUrl = items[0].json.body.response_url;\nconst text = items[0].json.body.text;\nconst [todeploy, branch] = text.split();\nconst instances = todeploy.split();\nreturn Array.from(new Set(instances)).map((name) => ({\n json: {\n name,\n repo: `n8n-heroku-${name}`,\n branch,\n responseUrl,\n instanceUrl: `https://n8n-${name}.herokuapp.com/`,\n username: name,\n password: test1234\n }\n}));\n"},"name":"Function1","type":"n8n-nodes-base.function","typeVersion":1,"position":[850,430]},{"parameters":{},"name":"NoOp1","type":"n8n-nodes-base.noOp","typeVersion":1,"position":[1000,520]},{"parameters":{"mode":"passThrough","output":"input2"},"name":"Merge","type":"n8n-nodes-base.merge","typeVersion":1,"position":[1260,770]},{"parameters":{"requestMethod":"POST","url":"=","responseFormat":"string","options":{},"bodyParametersUi":{"parameter":[{"name":"text","value":"=Updated with \"\" branch. Should take effect in 10 or so minutes.\nYou can follow its progress here https://github.com/mutdmour/n8n-heroku-/deployments/activity_log?environment=n8n-\n\nURL: \nusername: \npassword: "}]}},"name":"HTTP Request","type":"n8n-nodes-base.httpRequest","typeVersion":1,"position":[1460,770]},{"parameters":{"httpMethod":"POST","path":"5b44d7e0-0221-4886-a416-0070ac8cae67","options":{}},"name":"Webhook","type":"n8n-nodes-base.webhook","typeVersion":1,"position":[430,290],"webhookId":"5b44d7e0-0221-4886-a416-0070ac8cae67"}],"connections":{"IF":{"main":[[{"node":"NoOp","type":"main","index":0}],[{"node":"Function1","type":"main","index":0}]]},"GitHub":{"main":[[{"node":"Merge","type":"main","index":0}]]},"Function1":{"main":[[{"node":"NoOp1","type":"main","index":0}]]},"NoOp1":{"main":[[{"node":"GitHub","type":"main","index":0},{"node":"Merge","type":"main","index":1}]]},"Merge":{"main":[[{"node":"HTTP Request","type":"main","index":0}]]},"Webhook":{"main":[[{"node":"IF","type":"main","index":0}]]}}}' frame=true></n8n-demo>
```

### Features

- Complex workflow with multiple nodes
- Frame UI with code viewing
- Copy button functionality
- Real-world deployment automation example
- Multiple node types: Webhook, IF, GitHub, Function, HTTP Request, Merge

### Workflow Description

This example demonstrates a deployment automation workflow:

1. **Webhook** - Receives deployment trigger
2. **IF** - Conditional logic for deployment validation
3. **Function** - Processes deployment parameters
4. **GitHub** - Updates repository with deployment configuration
5. **Merge** - Combines deployment data
6. **HTTP Request** - Notifies deployment status

## Custom Styles Example

Workflow with custom styling using CSS custom properties.

### CSS

```css
n8n-demo {
  --n8n-frame-background-color: black;
  --n8n-json-background-color: lightgray;
  --n8n-copy-button-background-color: gray;
  --n8n-workflow-min-height: 500px;
  --n8n-iframe-border-radius: 30px;
}
```

### HTML

```html
<n8n-demo workflow='{"nodes":[{"name":"Workflow-Created","type":"n8n-nodes-base.webhook","position":[512,369],"parameters":{"path":"webhook","httpMethod":"POST"},"typeVersion":1}],"connections":{}}' frame="true"></n8n-demo>
```

### Features

- Custom dark theme
- Rounded corners
- Custom button styling
- Increased minimum height
- Custom background colors

### Available CSS Custom Properties

```css
n8n-demo {
  /* Frame background */
  --n8n-frame-background-color: #ffffff;
  
  /* JSON/code background */
  --n8n-json-background-color: #f8f9fa;
  
  /* Copy button styling */
  --n8n-copy-button-background-color: #007bff;
  --n8n-copy-button-color: #ffffff;
  --n8n-copy-button-border-radius: 4px;
  
  /* Workflow canvas */
  --n8n-workflow-min-height: 400px;
  --n8n-workflow-background-color: #ffffff;
  
  /* iframe styling */
  --n8n-iframe-border-radius: 8px;
  --n8n-iframe-border: 1px solid #dee2e6;
  
  /* Mobile responsive */
  --n8n-mobile-breakpoint: 768px;
}
```

## Advanced Examples

### Mobile Optimized

```html
<n8n-demo 
  workflow='{"nodes":[{"name":"Start","type":"n8n-nodes-base.start","typeVersion":1,"position":[250,300]}],"connections":{}}' 
  collapseformobile="true"
  clicktointeract="true"
  frame="true">
</n8n-demo>
```

### Read-Only Mode

```html
<n8n-demo 
  workflow='{"nodes":[{"name":"Start","type":"n8n-nodes-base.start","typeVersion":1,"position":[250,300]}],"connections":{}}' 
  disableinteractivity="true"
  hidecanvaserrors="true">
</n8n-demo>
```

### Dark Theme

```html
<n8n-demo 
  workflow='{"nodes":[{"name":"Start","type":"n8n-nodes-base.start","typeVersion":1,"position":[250,300]}],"connections":{}}' 
  theme="dark"
  frame="true">
</n8n-demo>
```

### Custom Source URL

```html
<n8n-demo 
  workflow='{"nodes":[{"name":"Start","type":"n8n-nodes-base.start","typeVersion":1,"position":[250,300]}],"connections":{}}' 
  src="https://your-n8n-instance.com/workflows/demo"
  frame="true">
</n8n-demo>
```

## Common Use Cases

### Documentation

```html
<!-- Workflow tutorial step -->
<n8n-demo 
  workflow='{"nodes":[{"name":"HTTP Request","type":"n8n-nodes-base.httpRequest","typeVersion":1,"position":[250,300],"parameters":{"url":"https://api.example.com/data","method":"GET"}}],"connections":{}}' 
  frame="true"
  hidecanvaserrors="true">
</n8n-demo>
```

### Workflow Gallery

```html
<!-- Workflow template preview -->
<n8n-demo 
  workflow='{"nodes":[{"name":"Slack","type":"n8n-nodes-base.slack","typeVersion":1,"position":[250,300]},{"name":"Email","type":"n8n-nodes-base.email","typeVersion":1,"position":[450,300]}],"connections":{"Slack":{"main":[[{"node":"Email","type":"main","index":0}]]}}}'
  clicktointeract="true"
  collapseformobile="true">
</n8n-demo>
```

### Interactive Demo

```html
<!-- Full interactive workflow -->
<n8n-demo 
  workflow='{"nodes":[{"name":"Schedule","type":"n8n-nodes-base.scheduleTrigger","typeVersion":1,"position":[250,300]},{"name":"Process","type":"n8n-nodes-base.function","typeVersion":1,"position":[450,300]},{"name":"Notify","type":"n8n-nodes-base.slack","typeVersion":1,"position":[650,300]}],"connections":{"Schedule":{"main":[[{"node":"Process","type":"main","index":0}]]},"Process":{"main":[[{"node":"Notify","type":"main","index":0}]]}}}'
  frame="true">
</n8n-demo>
```