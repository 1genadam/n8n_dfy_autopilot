# n8n Demo Web Component Knowledge Base

This knowledge base contains comprehensive documentation for the n8n demo web component, scraped from the official documentation at https://n8n-io.github.io/n8n-demo-webcomponent/.

## Documentation Files

### 📚 Core Documentation

1. **[Home Page](n8n-demo-webcomponent-home.md)**
   - Overview of the n8n demo web component
   - Basic usage examples
   - Key features and use cases

2. **[Installation Guide](n8n-demo-webcomponent-install.md)**
   - CDN installation instructions
   - NPM package installation
   - Framework integration examples (React, Vue, Angular)
   - Browser compatibility and troubleshooting

3. **[API Documentation](n8n-demo-webcomponent-api.md)**
   - Complete attributes and properties reference
   - Method documentation
   - Workflow JSON structure
   - CSS custom properties
   - Event handling
   - Browser compatibility

4. **[Examples](n8n-demo-webcomponent-examples.md)**
   - Basic workflow examples
   - Frame property usage
   - Custom styling examples
   - Advanced use cases
   - Mobile optimization
   - Common implementation patterns

## Quick Reference

### Basic Usage
```html
<n8n-demo workflow='{"nodes":[{"name":"Start","type":"n8n-nodes-base.start","typeVersion":1,"position":[250,300]}],"connections":{}}'></n8n-demo>
```

### With Frame
```html
<n8n-demo workflow='...' frame="true"></n8n-demo>
```

### Custom Styling
```css
n8n-demo {
  --n8n-frame-background-color: black;
  --n8n-json-background-color: lightgray;
  --n8n-workflow-min-height: 500px;
}
```

## Key Attributes

| Attribute | Description | Default |
|-----------|-------------|---------|
| `workflow` | Workflow JSON string | '{}' |
| `frame` | Show frame with code/copy | 'false' |
| `theme` | Force light/dark theme | undefined |
| `disableinteractivity` | Disable user interaction | 'false' |
| `hidecanvaserrors` | Hide node errors | 'false' |
| `collapseformobile` | Mobile-friendly collapsing | 'true' |
| `clicktointeract` | Require click to interact | 'false' |

## Common Use Cases

### 🎓 Documentation & Tutorials
- Embed workflow examples in documentation
- Create step-by-step tutorials
- Show workflow templates

### 📱 Content Creation
- Generate workflow previews for videos
- Create interactive demonstrations
- Build workflow galleries

### 🔧 Development & Testing
- Preview workflows during development
- Test workflow visualizations
- Debug workflow structures

### 🎨 Marketing & Presentations
- Showcase automation capabilities
- Create engaging workflow demos
- Build interactive landing pages

## Implementation for n8n DFY Autopilot

### Video Generation Pipeline
```javascript
// Generate workflow preview for tutorials
const workflowPreview = `
<n8n-demo 
  workflow='${JSON.stringify(generatedWorkflow)}'
  frame="true"
  theme="light"
  hidecanvaserrors="true">
</n8n-demo>
`;
```

### Customer Delivery
```javascript
// Embed workflow in customer documentation
const customerDemo = `
<n8n-demo 
  workflow='${customerWorkflow}'
  frame="true"
  clicktointeract="true"
  collapseformobile="true">
</n8n-demo>
`;
```

### Quality Assurance
```javascript
// Test workflow visualization
const testPreview = `
<n8n-demo 
  workflow='${workflowToTest}'
  disableinteractivity="true"
  hidecanvaserrors="false">
</n8n-demo>
`;
```

## Integration with Automation Pipeline

### 1. Workflow Generation
- Use component to preview generated workflows
- Validate visual representation
- Test workflow structure

### 2. Content Creation
- Generate HTML previews for video scripts
- Create interactive workflow demonstrations
- Build customer documentation

### 3. Customer Delivery
- Embed workflows in delivery packages
- Create interactive tutorials
- Provide visual workflow documentation

### 4. Quality Control
- Visual validation of generated workflows
- Error detection and debugging
- User experience testing

## Best Practices

### Performance
- Use `clicktointeract="true"` for pages with multiple workflows
- Enable `collapseformobile="true"` for mobile users
- Consider `disableinteractivity="true"` for static previews

### User Experience
- Always provide `frame="true"` for copy functionality
- Use appropriate `theme` setting for your site
- Hide errors with `hidecanvaserrors="true"` for public demos

### Development
- Validate JSON structure before embedding
- Test across different browsers
- Use CSS custom properties for consistent styling

## Source Information

This knowledge base was compiled from the official n8n demo web component documentation:
- **Original Source**: https://n8n-io.github.io/n8n-demo-webcomponent/
- **Package**: @n8n_io/n8n-demo-component
- **Last Updated**: July 16, 2025

## Related Resources

- [n8n Documentation](https://docs.n8n.io/)
- [n8n Community](https://community.n8n.io/)
- [n8n GitHub](https://github.com/n8n-io/n8n)
- [Web Components Standard](https://developer.mozilla.org/en-US/docs/Web/Web_Components)