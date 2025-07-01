# n8n JavaScript Code Patterns and Examples

## Code Node Fundamentals

### JavaScript in n8n Workflows
n8n supports JavaScript as the primary language for custom code nodes, enabling complex data transformations and custom logic within workflows.

### Code Node Capabilities
- Process data items and arrays
- Implement custom business logic
- Perform advanced data transformations
- Handle complex calculations
- Create dynamic workflow behavior

## Common Code Patterns

### Data Processing Patterns

#### Item-based Processing
```javascript
// Process each item in the input data
return $input.all().map(item => {
  return {
    json: {
      id: item.json.id,
      name: item.json.name.toUpperCase(),
      processed_at: new Date().toISOString()
    }
  };
});
```

#### Data Filtering
```javascript
// Filter items based on conditions
return $input.all().filter(item => {
  return item.json.status === 'active' && item.json.amount > 100;
});
```

#### Data Transformation
```javascript
// Transform data structure
const transformedData = $input.all().map(item => ({
  json: {
    customer_id: item.json.id,
    full_name: `${item.json.first_name} ${item.json.last_name}`,
    email: item.json.email.toLowerCase(),
    total_orders: item.json.orders?.length || 0,
    last_order_date: item.json.orders?.[0]?.date || null
  }
}));

return transformedData;
```

### Advanced Data Manipulation

#### Array Operations
```javascript
// Group data by category
const grouped = {};
$input.all().forEach(item => {
  const category = item.json.category;
  if (!grouped[category]) {
    grouped[category] = [];
  }
  grouped[category].push(item.json);
});

// Return grouped data as separate items
return Object.keys(grouped).map(category => ({
  json: {
    category,
    items: grouped[category],
    count: grouped[category].length
  }
}));
```

#### Data Aggregation
```javascript
// Calculate summary statistics
const data = $input.all().map(item => item.json);
const totals = data.reduce((acc, item) => ({
  total_amount: acc.total_amount + (item.amount || 0),
  total_quantity: acc.total_quantity + (item.quantity || 0),
  count: acc.count + 1
}), { total_amount: 0, total_quantity: 0, count: 0 });

return [{
  json: {
    ...totals,
    average_amount: totals.total_amount / totals.count,
    timestamp: new Date().toISOString()
  }
}];
```

### Conditional Logic Patterns

#### Complex Conditions
```javascript
// Implement complex business rules
return $input.all().map(item => {
  let priority = 'low';
  let action = 'review';
  
  if (item.json.amount > 1000) {
    priority = 'high';
    action = 'urgent_review';
  } else if (item.json.amount > 500 && item.json.customer_type === 'premium') {
    priority = 'medium';
    action = 'priority_review';
  }
  
  return {
    json: {
      ...item.json,
      priority,
      action,
      processed_by: 'automation_system'
    }
  };
});
```

#### Dynamic Routing
```javascript
// Route data based on conditions
const result = $input.all().map(item => {
  const route = item.json.amount > 500 ? 'high_value' : 'standard';
  
  return {
    json: {
      ...item.json,
      route,
      routing_timestamp: new Date().toISOString()
    }
  };
});

return result;
```

### Error Handling Patterns

#### Safe Data Access
```javascript
// Handle missing or undefined data
return $input.all().map(item => {
  try {
    return {
      json: {
        id: item.json?.id || 'unknown',
        name: item.json?.name || 'unnamed',
        email: item.json?.contact?.email || null,
        phone: item.json?.contact?.phone || null,
        valid: !!(item.json?.id && item.json?.name)
      }
    };
  } catch (error) {
    return {
      json: {
        error: error.message,
        original_data: item.json,
        processed_at: new Date().toISOString()
      }
    };
  }
});
```

#### Validation Patterns
```javascript
// Validate and clean data
return $input.all().map(item => {
  const errors = [];
  let cleanedData = { ...item.json };
  
  // Validate email
  if (cleanedData.email && !/\S+@\S+\.\S+/.test(cleanedData.email)) {
    errors.push('Invalid email format');
    cleanedData.email = null;
  }
  
  // Validate required fields
  if (!cleanedData.name || cleanedData.name.trim() === '') {
    errors.push('Name is required');
  }
  
  return {
    json: {
      ...cleanedData,
      validation_errors: errors,
      is_valid: errors.length === 0
    }
  };
});
```

### API Integration Patterns

#### Dynamic API Calls
```javascript
// Prepare data for API calls
return $input.all().map(item => {
  const apiPayload = {
    customer_id: item.json.id,
    order_data: {
      items: item.json.items,
      total: item.json.total,
      currency: item.json.currency || 'USD'
    },
    metadata: {
      source: 'n8n_automation',
      created_at: new Date().toISOString()
    }
  };
  
  return {
    json: apiPayload
  };
});
```

#### Response Processing
```javascript
// Process API responses
return $input.all().map(item => {
  const response = item.json;
  
  return {
    json: {
      request_id: response.id,
      status: response.success ? 'completed' : 'failed',
      message: response.message,
      data: response.data || null,
      processed_at: new Date().toISOString()
    }
  };
});
```

### Utility Functions

#### Date and Time Utilities
```javascript
// Date manipulation utilities
const today = new Date();
const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

return $input.all().map(item => {
  const itemDate = new Date(item.json.date);
  
  return {
    json: {
      ...item.json,
      is_recent: itemDate > thirtyDaysAgo,
      age_days: Math.floor((today - itemDate) / (24 * 60 * 60 * 1000)),
      formatted_date: itemDate.toLocaleDateString()
    }
  };
});
```

#### String Processing
```javascript
// String manipulation utilities
return $input.all().map(item => {
  const name = item.json.name || '';
  
  return {
    json: {
      ...item.json,
      name_cleaned: name.trim().toLowerCase(),
      name_title_case: name.split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' '),
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    }
  };
});
```

## Best Practices

### Performance Optimization
1. **Minimize loops**: Use built-in array methods efficiently
2. **Avoid deep nesting**: Keep code readable and maintainable
3. **Cache calculations**: Store computed values when reused
4. **Handle large datasets**: Consider memory usage for large data processing

### Code Organization
1. **Use clear variable names**: Make code self-documenting
2. **Add comments**: Explain complex logic
3. **Modular functions**: Break complex operations into smaller functions
4. **Consistent formatting**: Follow JavaScript best practices

### Error Handling
1. **Always validate input**: Check for required fields and data types
2. **Use try-catch blocks**: Handle potential runtime errors
3. **Provide meaningful errors**: Include context for debugging
4. **Graceful degradation**: Continue processing when possible

### Security Considerations
1. **Sanitize input data**: Clean user-provided data
2. **Validate data types**: Ensure expected data structures
3. **Avoid eval()**: Never use eval() or similar dangerous functions
4. **Handle sensitive data**: Be careful with credentials and personal information

## Advanced Techniques

### Dynamic Schema Generation
```javascript
// Generate dynamic schema based on data
const schema = {};
const sampleData = $input.first().json;

Object.keys(sampleData).forEach(key => {
  const value = sampleData[key];
  schema[key] = {
    type: typeof value,
    required: value !== null && value !== undefined,
    example: value
  };
});

return [{
  json: {
    schema,
    generated_at: new Date().toISOString()
  }
}];
```

### Custom Validation Rules
```javascript
// Implement custom validation rules
const validationRules = {
  email: (value) => /\S+@\S+\.\S+/.test(value),
  phone: (value) => /^\+?[\d\s-()]+$/.test(value),
  required: (value) => value !== null && value !== undefined && value !== '',
  min_length: (value, min) => typeof value === 'string' && value.length >= min
};

return $input.all().map(item => {
  const errors = [];
  
  if (!validationRules.required(item.json.name)) {
    errors.push('Name is required');
  }
  
  if (item.json.email && !validationRules.email(item.json.email)) {
    errors.push('Invalid email format');
  }
  
  return {
    json: {
      ...item.json,
      validation_errors: errors,
      is_valid: errors.length === 0
    }
  };
});
```

This comprehensive guide provides practical JavaScript patterns for building robust n8n workflows with proper error handling, data validation, and performance optimization.