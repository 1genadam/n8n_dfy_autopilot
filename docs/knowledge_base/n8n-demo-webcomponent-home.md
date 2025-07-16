# n8n Demo Web Component - Home Page

## Overview

`<n8n-demo>` is a web component to render workflow previews.

## As easy as HTML

`<n8n-demo>` is just an HTML element. You can use it anywhere you can use HTML!

### Basic Usage

```html
<n8n-demo workflow='{"nodes":[{"name":"Workflow-Created","type":"n8n-nodes-base.webhook","position":[512,369],"parameters":{"path":"webhook","httpMethod":"POST"},"typeVersion":1}],"connections":{}}'></n8n-demo>
```

## Configure with attributes

`<n8n-demo>` can be configured with attributes in plain HTML.

### With Frame

```html
<n8n-demo workflow='{"nodes":[{"name":"Workflow-Created","type":"n8n-nodes-base.webhook","position":[512,369],"parameters":{"path":"webhook","httpMethod":"POST"},"typeVersion":1}],"connections":{}}' frame=true></n8n-demo>
```

## Declarative rendering

`<n8n-demo>` can be used with declarative rendering libraries like Angular, React, Vue, and lit-html

### Example with lit-html

```javascript
import {html, render} from 'lit-html';

const workflow = '{"nodes":[{"name":"Workflow-Created","type":"n8n-nodes-base.webhook","position":[512,369],"parameters":{"path":"webhook","httpMethod":"POST"},"typeVersion":1}],"connections":{}}';

render(
  html`
    <h2>This is a <n8n-demo></h2>
    <n8n-demo .workflow=${workflow}></n8n-demo>
  `,
  document.body
);
```

## Key Features

- **Simple HTML element** - Works anywhere HTML is supported
- **Workflow preview** - Renders n8n workflows in a visual format
- **Configurable** - Multiple attributes for customization
- **Framework agnostic** - Works with any JavaScript framework
- **Interactive** - Supports user interaction with workflows
- **Customizable styling** - CSS custom properties for theming

## Use Cases

- Documentation and tutorials
- Workflow sharing and collaboration
- Embedding workflows in websites
- Creating interactive workflow demonstrations
- Building workflow galleries and showcases