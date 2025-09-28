# Template for ioBroker Adapter Copilot Instructions

This is the template file that should be copied to your ioBroker adapter repository as `.github/copilot-instructions.md`.

## How to Use This Template

**Prerequisites:** Ensure you have GitHub Copilot already set up and working in your repository before using this template. If you need help with basic setup, see the [Prerequisites & Setup Guide](README.md#🛠️-prerequisites--basic-github-copilot-setup) in the main repository.

1. Copy this entire content
2. Save it as `.github/copilot-instructions.md` in your adapter repository
3. Customize the sections marked with `[CUSTOMIZE]` if needed
4. Commit the file to enable GitHub Copilot integration

**Note:** If downloading via curl, use the sed command to remove the template comment block:
```bash
curl -o .github/copilot-instructions.md https://raw.githubusercontent.com/DrozmotiX/ioBroker-Copilot-Instructions/main/template.md
sed -i '/^<!--$/,/^-->$/d' .github/copilot-instructions.md
```

---

# ioBroker Adapter Development with GitHub Copilot

**Version:** 0.4.0
**Template Source:** https://github.com/DrozmotiX/ioBroker-Copilot-Instructions

This file contains instructions and best practices for GitHub Copilot when working on ioBroker adapter development.

## Project Context

You are working on an ioBroker adapter. ioBroker is an integration platform for the Internet of Things, focused on building smart home and industrial IoT solutions. Adapters are plugins that connect ioBroker to external systems, devices, or services.

### ZoneMinder Security Camera Adapter

This adapter connects ioBroker to ZoneMinder, an open-source video surveillance software system. ZoneMinder is designed for monitoring multiple cameras and provides features like motion detection, video recording, and event management.

**Key Adapter Functions:**
- Connect to ZoneMinder server via HTTP/HTTPS API
- Monitor camera states and functions (None, Monitor, Modect, Record, Mocord, Nodect)
- Retrieve monitor information and statistics
- Handle ZoneMinder events and notifications
- Support for WebSocket connections for real-time event monitoring
- Control monitor activation and function modes

**External Dependencies:**
- ZoneMinder server (minimum version not specified)
- WebSocket support for event notifications
- HTTP API authentication (user/password or API key)

**Configuration Requirements:**
- ZoneMinder host URL (default: http://zoneminder/zm)
- Authentication credentials (username/password)
- Polling intervals for monitors and states
- Event monitoring toggle

## Testing

### Unit Testing
- Use Jest as the primary testing framework for ioBroker adapters
- Create tests for all adapter main functions and helper methods
- Test error handling scenarios and edge cases
- Mock external API calls and hardware dependencies
- For adapters connecting to APIs/devices not reachable by internet, provide example data files to allow testing of functionality without live connections
- Example test structure:
  ```javascript
  describe('AdapterName', () => {
    let adapter;
    
    beforeEach(() => {
      // Setup test adapter instance
    });
    
    test('should initialize correctly', () => {
      // Test adapter initialization
    });
  });
  ```

### Integration Testing

**IMPORTANT**: Use the official `@iobroker/testing` framework for all integration tests. This is the ONLY correct way to test ioBroker adapters.

**Official Documentation**: https://github.com/ioBroker/testing

#### Framework Structure
Integration tests MUST follow this exact pattern:

```javascript
const path = require('path');
const { tests } = require('@iobroker/testing');

// Define test coordinates or configuration
const TEST_COORDINATES = '52.520008,13.404954'; // Berlin
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Use tests.integration() with defineAdditionalTests
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Test adapter with specific configuration', (getHarness) => {
            let harness;

            before(() => {
                harness = getHarness();
            });

            it('should configure and start adapter', function () {
                return new Promise(async (resolve, reject) => {
                    try {
                        harness = getHarness();
                        // Define specific adapter configuration for testing
                        harness.objects.setObject('system.adapter.adaptername.0', {
                            common: {
                                enabled: true
                            },
                            native: {
                                testCoordinates: TEST_COORDINATES
                            }
                        });

                        await harness.states.setState('system.adapter.adaptername.0.alive', true);
                        await wait(2000);

                        // Test specific functionality
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                });
            });
        });
    }
});
```

#### ZoneMinder-Specific Testing Considerations

- Mock ZoneMinder API responses to avoid requiring a live ZoneMinder installation
- Test authentication mechanisms and error handling for connection failures
- Validate monitor state changes and function switching
- Test WebSocket connection handling and reconnection logic
- Verify event processing and state updates

Example mock data structure for ZoneMinder API:
```javascript
const mockMonitorData = {
    "monitors": [
        {
            "Monitor": {
                "Id": "1",
                "Name": "Camera1",
                "Function": "Modect",
                "Enabled": "1",
                "Width": "1920",
                "Height": "1080"
            }
        }
    ]
};
```

## Architecture & File Structure

### Standard ioBroker Adapter Structure
Your adapter should follow the standard ioBroker adapter file structure:

```
adapter-name/
├── admin/              # Admin interface files
│   ├── index.html     # Admin web interface
│   ├── words.js       # Translations
│   └── zoneminder.png # Icon
├── lib/               # Library files
│   └── api.js         # ZoneMinder API client
├── test/              # Test files
│   ├── integration.js
│   └── package.js
├── main.js           # Main adapter file
├── io-package.json   # ioBroker configuration
└── package.json      # NPM configuration
```

### Key Files in ZoneMinder Adapter

**`main.js`** - Main adapter logic:
- Adapter initialization and configuration
- Connection to ZoneMinder API
- Monitor state management
- Event handling and state updates
- WebSocket connection management
- Proper cleanup in unload() method

**`lib/api.js`** - ZoneMinder API client:
- HTTP request handling to ZoneMinder server
- Authentication management
- Monitor control functions
- Event processing
- WebSocket client for real-time notifications

**`io-package.json`** - Adapter configuration:
- Adapter metadata and requirements
- Native configuration schema
- Instance objects definition
- Dependencies on js-controller and admin

## Code Patterns & Best Practices

### ioBroker Adapter Lifecycle
Always implement these key lifecycle methods properly:

```javascript
// In main.js
function startAdapter(options) {
    return adapter = utils.adapter(Object.assign({}, options, {
        name: 'zoneminder',
        ready: main, // Called when adapter is ready
        unload: (callback) => {
            // CRITICAL: Clean up resources
            try {
                clearTimeout(requestInterval);
                if (zm) {
                    zm.websocketClose();
                }
                adapter.log.info('cleaned everything up...');
                callback();
            } catch (e) {
                callback();
            }
        },
        stateChange: (id, state) => {
            // Handle state changes
            if (state && !state.ack) {
                // Handle commands
            }
        }
    }));
}
```

### ZoneMinder API Integration Patterns

#### Monitor Function States
```javascript
const FUNCSTATES = {
    0: 'None',
    1: 'Monitor',
    2: 'Modect',
    3: 'Record',
    4: 'Mocord',
    5: 'Nodect'
};

// Function to change monitor function
functionChange(id, state, callback) {
    this._get2(`/api/monitors/${id}.json?&` + this.authUrl, 
               `Monitor[Function]=${FUNCSTATES[state]}`, callback);
}
```

#### WebSocket Event Handling
```javascript
// WebSocket connection for real-time events
websocketConnect() {
    this.client = new WebSocketClient();
    this.client.on('connectFailed', (error) => {
        this.adapter.log.error('Connect Error: ' + error.toString());
    });
    this.client.on('connect', (connection) => {
        connection.on('message', (message) => {
            if (message.type === 'utf8') {
                const data = JSON.parse(message.utf8Data);
                this.processEvent(data);
            }
        });
    });
}
```

### State Management

#### Creating States
```javascript
// Create monitor states
_createState(sid, name, type, val, callback) {
    adapter.getObject(sid, (err, obj) => {
        if (!obj) {
            adapter.setObject(sid, {
                type: 'state',
                common: {
                    name: name,
                    type: type,
                    role: 'indicator',
                    read: true,
                    write: true,
                    def: val
                },
                native: {}
            }, callback);
        } else if (callback) {
            callback();
        }
    });
}
```

#### State Change Handling
```javascript
// Handle state changes for monitor control
if (id.endsWith('.active')) {
    const monitorId = id.split('.')[2];
    const active = state.val ? 1 : 0;
    zm.activeCange(monitorId, active, (err, result) => {
        if (!err) {
            adapter.setStateAsync(id, { val: state.val, ack: true });
        }
    });
} else if (id.endsWith('.function')) {
    const monitorId = id.split('.')[2];
    const funcState = state.val;
    zm.functionCange(monitorId, funcState, (err, result) => {
        if (!err) {
            adapter.setStateAsync(id, { val: state.val, ack: true });
        }
    });
}
```

### Error Handling Patterns

#### API Error Handling
```javascript
// Proper error handling for ZoneMinder API calls
_get(url, callback) {
    const options = {
        url: this.host + url,
        headers: {
            'User-Agent': 'ioBroker ZoneMinder Adapter'
        },
        timeout: 10000
    };

    rp(options)
        .then((response) => {
            try {
                const json = JSON.parse(response);
                if (typeof callback === 'function') callback(null, json);
            } catch (e) {
                this.adapter.log.error('JSON Parse Error: ' + e.message);
                if (typeof callback === 'function') callback(e);
            }
        })
        .catch((error) => {
            this.adapter.log.error('Request failed: ' + error.message);
            if (typeof callback === 'function') callback(error);
        });
}
```

#### Connection Monitoring
```javascript
// Monitor connection status
checkConnection() {
    this.getVersion((err, data) => {
        if (err) {
            this.adapter.setStateAsync('info.connection', false, true);
            this.adapter.log.warn('ZoneMinder connection lost');
        } else {
            this.adapter.setStateAsync('info.connection', true, true);
        }
    });
}
```

## Dependencies & Libraries

### Core ioBroker Dependencies
- `@iobroker/adapter-core`: Core adapter functionality
- Minimum js-controller version: 5.0.19
- Admin interface compatibility: >=6.13.16

### ZoneMinder-Specific Dependencies
- `request-promise`: HTTP requests to ZoneMinder API (deprecated, consider migration)
- `websocket`: WebSocket client for real-time event monitoring
- `mqtt`: MQTT client for alternative communication (if used)

### Development Dependencies
- `@iobroker/testing`: Official testing framework
- `@iobroker/adapter-dev`: Development tools
- `eslint`: Code linting
- `mocha`: Test runner
- `sinon`: Test mocking

## Configuration

### io-package.json Native Configuration
```json
{
  "native": {
    "host": "http://zoneminder/zm",
    "user": "admin",
    "password": "admin",
    "pollingMon": 5,
    "pollingMonState": 1,
    "zmEvent": false
  }
}
```

### Admin Interface (admin/index.html)
Provide user-friendly configuration interface for:
- ZoneMinder server URL
- Authentication credentials
- Polling intervals
- Event monitoring options
- Connection testing

## Logging & Debugging

### Logging Levels
Use appropriate logging levels throughout the adapter:

```javascript
adapter.log.error('Critical errors that prevent operation');
adapter.log.warn('Important warnings that don\'t stop operation');
adapter.log.info('General information about adapter state');
adapter.log.debug('Detailed information for troubleshooting');
```

### ZoneMinder-Specific Logging
```javascript
// Log API responses for debugging
this.adapter.log.debug('ZoneMinder API response: ' + JSON.stringify(data));

// Log monitor state changes
this.adapter.log.info(`Monitor ${id} function changed to ${FUNCSTATES[state]}`);

// Log WebSocket events
this.adapter.log.debug('ZoneMinder event received: ' + JSON.stringify(event));
```

## Common Patterns to Avoid

### Anti-patterns in ioBroker Development
1. **Don't modify package.json for version tracking** - Use copilot-instructions.md version field
2. **Don't ignore unload() cleanup** - Always properly clean up resources
3. **Don't block the event loop** - Use async/await properly
4. **Don't hardcode delays** - Use configurable timeouts
5. **Don't ignore error states** - Always handle API failures gracefully

### ZoneMinder-Specific Anti-patterns
1. **Don't poll too aggressively** - Respect server resources with reasonable intervals
2. **Don't store credentials in plain text** - Use ioBroker's native secure storage
3. **Don't ignore WebSocket connection failures** - Implement reconnection logic
4. **Don't assume API format** - Always validate response structure
5. **Don't mix sync and async patterns** - Be consistent with promise handling

## Security Considerations

### Authentication & Credentials
- Store sensitive data in adapter's native configuration
- Support multiple authentication methods (user/pass, API keys)
- Validate SSL certificates for HTTPS connections
- Implement proper session management for API access

### API Security
```javascript
// Example secure API request handling
makeSecureRequest(endpoint, data) {
    const options = {
        url: this.config.host + endpoint,
        method: 'POST',
        json: true,
        body: data,
        headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'User-Agent': 'ioBroker ZoneMinder Adapter'
        },
        timeout: 10000,
        strictSSL: true // Validate SSL certificates
    };
    
    return rp(options);
}
```

## Performance Optimization

### Efficient Polling Strategies
- Use configurable polling intervals
- Implement exponential backoff for failed requests
- Cache frequently accessed data
- Use WebSocket for real-time events instead of polling when possible

### Memory Management
- Clean up timers and intervals in unload()
- Release WebSocket connections properly
- Avoid memory leaks in event handlers
- Monitor adapter memory usage

### Network Optimization
- Batch API requests when possible
- Use compression for large data transfers
- Implement request queuing for high-frequency operations
- Handle rate limiting from ZoneMinder server

## Code Style & Conventions

Follow these conventions when working with this adapter:

### JavaScript/ES6+ Patterns
- Use `const` and `let` instead of `var`
- Prefer async/await over callbacks where possible
- Use template literals for string formatting
- Implement proper error handling with try/catch

### ioBroker Specific Conventions
- Use adapter.log instead of console.log
- Follow the adapter naming convention (lowercase, dots for separation)
- Use proper state roles and types
- Implement proper cleanup in unload method

### ZoneMinder API Patterns
- Use consistent error handling for all API calls
- Implement retry logic for transient failures
- Cache API responses when appropriate
- Validate API response structure before processing

## Updates & Maintenance

This file is managed by the centralized ioBroker Copilot Instructions system. 
- Version updates are handled automatically
- Custom sections marked with [CUSTOMIZE] are preserved during updates
- Template source: https://github.com/DrozmotiX/ioBroker-Copilot-Instructions
- Current template version: 0.4.0

For issues or suggestions regarding these instructions, please visit the template repository.