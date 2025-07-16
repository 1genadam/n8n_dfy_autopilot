# n8n Demo Web Component - Installation Guide

## Overview

`<n8n-demo>` is distributed on npm, so you can install it locally or use it via npm CDNs like unpkg.com.

## CDN Installation (Recommended)

### Required Scripts

Add these scripts to your HTML page in the following order:

```html
<script src="https://cdn.jsdelivr.net/npm/@webcomponents/webcomponentsjs@2.0.0/webcomponents-loader.js"></script>
<script src="https://www.unpkg.com/lit@2.0.0-rc.2/polyfill-support.js"></script>
<script type="module" src="https://cdn.jsdelivr.net/npm/@n8n_io/n8n-demo-component/n8n-demo.bundled.js"></script>
```

### Usage After Installation

After adding these scripts, you can now directly use the component within HTML:

```html
<n8n-demo workflow='{"nodes":[{"name":"Start","type":"n8n-nodes-base.start","typeVersion":1,"position":[250,300]}],"connections":{}}'></n8n-demo>
```

## NPM Installation

### Install Package

```bash
npm install @n8n_io/n8n-demo-component
```

### Import in JavaScript

```javascript
import '@n8n_io/n8n-demo-component';
```

### Usage in Module

```javascript
import '@n8n_io/n8n-demo-component';

// Now you can use the component
document.body.innerHTML = `
  <n8n-demo workflow='{"nodes":[{"name":"Start","type":"n8n-nodes-base.start","typeVersion":1,"position":[250,300]}],"connections":{}}'></n8n-demo>
`;
```

## Framework Integration

### React

```jsx
import React from 'react';
import '@n8n_io/n8n-demo-component';

function WorkflowPreview({ workflowData }) {
  return (
    <n8n-demo 
      workflow={JSON.stringify(workflowData)}
      frame="true"
    />
  );
}
```

### Vue

```vue
<template>
  <n8n-demo 
    :workflow="workflowJson"
    frame="true"
  />
</template>

<script>
import '@n8n_io/n8n-demo-component';

export default {
  name: 'WorkflowPreview',
  props: {
    workflowData: Object
  },
  computed: {
    workflowJson() {
      return JSON.stringify(this.workflowData);
    }
  }
}
</script>
```

### Angular

```typescript
import { Component, Input } from '@angular/core';
import '@n8n_io/n8n-demo-component';

@Component({
  selector: 'app-workflow-preview',
  template: `
    <n8n-demo 
      [workflow]="workflowJson"
      frame="true">
    </n8n-demo>
  `
})
export class WorkflowPreviewComponent {
  @Input() workflowData: any;
  
  get workflowJson() {
    return JSON.stringify(this.workflowData);
  }
}
```

## Browser Support

- Modern browsers with Web Components support
- IE11+ with polyfills
- Mobile browsers (iOS Safari, Chrome Mobile)

## Troubleshooting

### Common Issues

1. **Component not rendering**: Ensure all required scripts are loaded
2. **Workflow not displaying**: Check JSON syntax and structure
3. **Styling issues**: Verify CSS custom properties are supported

### Debug Mode

```html
<n8n-demo 
  workflow='{"nodes":[],"connections":{}}' 
  frame="true"
  hidecanvaserrors="false">
</n8n-demo>
```

## Next Steps

- [API Documentation](n8n-demo-webcomponent-api.md)
- [Examples](n8n-demo-webcomponent-examples.md)
- [Customization](n8n-demo-webcomponent-customize.md)