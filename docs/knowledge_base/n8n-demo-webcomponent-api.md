# n8n Demo Web Component - API Documentation

## Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| `workflow` | Workflow json to load. | string | '{}' |
| `frame` | Whether to add frame around canvas with code and copy button | string | 'false' |
| `src` | URL for n8n instance to load workflow. | string | 'https://n8n-preview-service.internal.n8n.cloud/workflows/demo' |
| `collapseformobile` | Whether to collapse on mobile, so that scrolling on mobile is easier. | string | 'true' |
| `clicktointeract` | Add button before users can interact with canvas. Makes scrolling through page easier without getting bugged down. | string | 'false' |
| `hidecanvaserrors` | Hide node errors on the canvas | string | 'false' |
| `disableinteractivity` | Disable interactivity entirely. This will prevent the user from interacting with the workflow. | string | 'false' |
| `theme` | Whether to force a theme on n8n. Accepts 'light' and 'dark' | string | undefined |

## Properties

| Name | Attribute | Description | Type | Default |
|------|-----------|-------------|------|---------|
| `workflow` | `workflow` | Workflow json to load. | string | '{}' |
| `frame` | `frame` | Whether to add frame around canvas with code and copy button | string | 'false' |
| `src` | `src` | URL for n8n instance to load workflow. | string | 'https://n8n-preview-service.internal.n8n.cloud/workflows/demo' |
| `collapseformobile` | `collapseformobile` | Whether to collapse on mobile, so that scrolling on mobile is easier. | string | 'true' |
| `clicktointeract` | `clicktointeract` | Add button before users can interact with canvas. Makes scrolling through page easier without getting bugged down. | string | 'false' |
| `hidecanvaserrors` | `hidecanvaserrors` | Hide node errors on the canvas | string | 'false' |
| `disableinteractivity` | `disableinteractivity` | Disable interactivity entirely. This will prevent the user from interacting with the workflow. | string | 'false' |
| `theme` | `theme` | Whether to force a theme on n8n. Accepts 'light' and 'dark' | string | undefined |
| `showCode` | - | Show code panel | boolean | false |
| `showPreview` | - | Show preview panel | boolean | true |
| `fullscreen` | - | Fullscreen mode | boolean | false |
| `insideIframe` | - | Inside iframe flag | boolean | false |
| `copyText` | - | Copy button text | string | 'Copy' |
| `isMobileView` | - | Mobile view flag | boolean | false |
| `error` | - | Error state | boolean | false |
| `interactive` | - | Interactive mode | boolean | true |
| `scrollX` | - | Horizontal scroll position | number | 0 |
| `scrollY` | - | Vertical scroll position | number | 0 |

## Methods

| Name | Description |
|------|-------------|
| `receiveMessage` | Handle messages from iframe |
| `onDocumentScroll` | Handle document scroll events |

## Usage Examples

### Basic Usage

```html
<n8n-demo workflow='{"nodes":[{"name":"Start","type":"n8n-nodes-base.start","typeVersion":1,"position":[250,300]}],"connections":{}}'></n8n-demo>
```

### With Frame

```html
<n8n-demo 
  workflow='{"nodes":[{"name":"Start","type":"n8n-nodes-base.start","typeVersion":1,"position":[250,300]}],"connections":{}}' 
  frame="true">
</n8n-demo>
```

### Dark Theme

```html
<n8n-demo 
  workflow='{"nodes":[{"name":"Start","type":"n8n-nodes-base.start","typeVersion":1,"position":[250,300]}],"connections":{}}' 
  theme="dark">
</n8n-demo>
```

### Mobile Optimized

```html
<n8n-demo 
  workflow='{"nodes":[{"name":"Start","type":"n8n-nodes-base.start","typeVersion":1,"position":[250,300]}],"connections":{}}' 
  collapseformobile="true"
  clicktointeract="true">
</n8n-demo>
```

### Disabled Interactivity

```html
<n8n-demo 
  workflow='{"nodes":[{"name":"Start","type":"n8n-nodes-base.start","typeVersion":1,"position":[250,300]}],"connections":{}}' 
  disableinteractivity="true">
</n8n-demo>
```

### Hide Canvas Errors

```html
<n8n-demo 
  workflow='{"nodes":[{"name":"Start","type":"n8n-nodes-base.start","typeVersion":1,"position":[250,300]}],"connections":{}}' 
  hidecanvaserrors="true">
</n8n-demo>
```

## Workflow JSON Structure

The `workflow` attribute expects a JSON string with the following structure:

```json
{
  "nodes": [
    {
      "name": "Node Name",
      "type": "n8n-nodes-base.nodetype",
      "typeVersion": 1,
      "position": [x, y],
      "parameters": {
        "param1": "value1",
        "param2": "value2"
      }
    }
  ],
  "connections": {
    "Node Name": {
      "main": [
        [
          {
            "node": "Target Node",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  }
}
```

## CSS Custom Properties

The component supports the following CSS custom properties for styling:

```css
n8n-demo {
  --n8n-frame-background-color: #ffffff;
  --n8n-json-background-color: #f8f9fa;
  --n8n-copy-button-background-color: #007bff;
  --n8n-workflow-min-height: 400px;
  --n8n-iframe-border-radius: 8px;
}
```

## Events

The component fires the following events:

- `workflow-loaded` - When workflow is successfully loaded
- `workflow-error` - When there's an error loading the workflow
- `node-selected` - When a node is selected in the workflow
- `workflow-executed` - When workflow execution is triggered

## Browser Compatibility

- Chrome 60+
- Firefox 63+
- Safari 10.1+
- Edge 79+
- IE 11 (with polyfills)