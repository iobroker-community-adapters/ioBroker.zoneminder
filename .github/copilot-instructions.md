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

**Version:** 0.4.2
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
                        
                        // Get adapter object using promisified pattern
                        const obj = await new Promise((res, rej) => {
                            harness.objects.getObject('system.adapter.your-adapter.0', (err, o) => {
                                if (err) return rej(err);
                                res(o);
                            });
                        });
                        
                        if (!obj) {
                            return reject(new Error('Adapter object not found'));
                        }

                        // Configure adapter properties
                        Object.assign(obj.native, {
                            position: TEST_COORDINATES,
                            createCurrently: true,
                            createHourly: true,
                            createDaily: true,
                            // Add other configuration as needed
                        });

                        // Set the updated configuration
                        harness.objects.setObject(obj._id, obj);

                        console.log('✅ Step 1: Configuration written, starting adapter...');
                        
                        // Start adapter and wait
                        await harness.startAdapterAndWait();
                        
                        console.log('✅ Step 2: Adapter started');

                        // Wait for adapter to process data
                        const waitMs = 15000;
                        await wait(waitMs);

                        console.log('🔍 Step 3: Checking states after adapter run...');
                        
                        // Get all states created by adapter
                        const stateIds = await harness.dbConnection.getStateIDs('your-adapter.0.*');
                        
                        console.log(`📊 Found ${stateIds.length} states`);

                        if (stateIds.length > 0) {
                            console.log('✅ Adapter successfully created states');
                            
                            // Show sample of created states
                            const allStates = await new Promise((res, rej) => {
                                harness.states.getStates(stateIds, (err, states) => {
                                    if (err) return rej(err);
                                    res(states || []);
                                });
                            });
                            
                            console.log('📋 Sample states created:');
                            stateIds.slice(0, 5).forEach((stateId, index) => {
                                const state = allStates[index];
                                console.log(`   ${stateId}: ${state && state.val !== undefined ? state.val : 'undefined'}`);
                            });
                            
                            await harness.stopAdapter();
                            resolve(true);
                        } else {
                            console.log('❌ No states were created by the adapter');
                            reject(new Error('Adapter did not create any states'));
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
            }).timeout(40000);
        });
    }
});
```

#### Testing Both Success AND Failure Scenarios

**IMPORTANT**: For every "it works" test, implement corresponding "it doesn't work and fails" tests. This ensures proper error handling and validates that your adapter fails gracefully when expected.

```javascript
// Example: Testing successful configuration
it('should configure and start adapter with valid configuration', function () {
    return new Promise(async (resolve, reject) => {
        // ... successful configuration test as shown above
    });
}).timeout(40000);

// Example: Testing failure scenarios
it('should NOT create daily states when daily is disabled', function () {
    return new Promise(async (resolve, reject) => {
        try {
            harness = getHarness();
            
            console.log('🔍 Step 1: Fetching adapter object...');
            const obj = await new Promise((res, rej) => {
                harness.objects.getObject('system.adapter.your-adapter.0', (err, o) => {
                    if (err) return rej(err);
                    res(o);
                });
            });
            
            if (!obj) return reject(new Error('Adapter object not found'));
            console.log('✅ Step 1.5: Adapter object loaded');

            console.log('🔍 Step 2: Updating adapter config...');
            Object.assign(obj.native, {
                position: TEST_COORDINATES,
                createCurrently: false,
                createHourly: true,
                createDaily: false, // Daily disabled for this test
            });

            await new Promise((res, rej) => {
                harness.objects.setObject(obj._id, obj, (err) => {
                    if (err) return rej(err);
                    console.log('✅ Step 2.5: Adapter object updated');
                    res(undefined);
                });
            });

            console.log('🔍 Step 3: Starting adapter...');
            await harness.startAdapterAndWait();
            console.log('✅ Step 4: Adapter started');

            console.log('⏳ Step 5: Waiting 20 seconds for states...');
            await new Promise((res) => setTimeout(res, 20000));

            console.log('🔍 Step 6: Fetching state IDs...');
            const stateIds = await harness.dbConnection.getStateIDs('your-adapter.0.*');

            console.log(`📊 Step 7: Found ${stateIds.length} total states`);

            const hourlyStates = stateIds.filter((key) => key.includes('hourly'));
            if (hourlyStates.length > 0) {
                console.log(`✅ Step 8: Correctly ${hourlyStates.length} hourly weather states created`);
            } else {
                console.log('❌ Step 8: No hourly states created (test failed)');
                return reject(new Error('Expected hourly states but found none'));
            }

            // Check daily states should NOT be present
            const dailyStates = stateIds.filter((key) => key.includes('daily'));
            if (dailyStates.length === 0) {
                console.log(`✅ Step 9: No daily states found as expected`);
            } else {
                console.log(`❌ Step 9: Daily states present (${dailyStates.length}) (test failed)`);
                return reject(new Error('Expected no daily states but found some'));
            }

            await harness.stopAdapter();
            console.log('🛑 Step 10: Adapter stopped');

            resolve(true);
        } catch (error) {
            reject(error);
        }
    });
}).timeout(40000);

// Example: Testing missing required configuration  
it('should handle missing required configuration properly', function () {
    return new Promise(async (resolve, reject) => {
        try {
            harness = getHarness();
            
            console.log('🔍 Step 1: Fetching adapter object...');
            const obj = await new Promise((res, rej) => {
                harness.objects.getObject('system.adapter.your-adapter.0', (err, o) => {
                    if (err) return rej(err);
                    res(o);
                });
            });
            
            if (!obj) return reject(new Error('Adapter object not found'));

            console.log('🔍 Step 2: Removing required configuration...');
            // Remove required configuration to test failure handling
            delete obj.native.position; // This should cause failure or graceful handling

            await new Promise((res, rej) => {
                harness.objects.setObject(obj._id, obj, (err) => {
                    if (err) return rej(err);
                    res(undefined);
                });
            });

            console.log('🔍 Step 3: Starting adapter...');
            await harness.startAdapterAndWait();

            console.log('⏳ Step 4: Waiting for adapter to process...');
            await new Promise((res) => setTimeout(res, 10000));

            console.log('🔍 Step 5: Checking adapter behavior...');
            const stateIds = await harness.dbConnection.getStateIDs('your-adapter.0.*');

            // Check if adapter handled missing configuration gracefully
            if (stateIds.length === 0) {
                console.log('✅ Adapter properly handled missing configuration - no invalid states created');
                resolve(true);
            } else {
                // If states were created, check if they're in error state
                const connectionState = await new Promise((res, rej) => {
                    harness.states.getState('your-adapter.0.info.connection', (err, state) => {
                        if (err) return rej(err);
                        res(state);
                    });
                });
                
                if (!connectionState || connectionState.val === false) {
                    console.log('✅ Adapter properly failed with missing configuration');
                    resolve(true);
                } else {
                    console.log('❌ Adapter should have failed or handled missing config gracefully');
                    reject(new Error('Adapter should have handled missing configuration'));
                }
            }

            await harness.stopAdapter();
        } catch (error) {
            console.log('✅ Adapter correctly threw error with missing configuration:', error.message);
            resolve(true);
        }
    });
}).timeout(40000);
```

#### Advanced State Access Patterns

For testing adapters that create multiple states, use bulk state access methods to efficiently verify large numbers of states:

```javascript
it('should create and verify multiple states', () => new Promise(async (resolve, reject) => {
    // Configure and start adapter first...
    harness.objects.getObject('system.adapter.tagesschau.0', async (err, obj) => {
        if (err) {
            console.error('Error getting adapter object:', err);
            reject(err);
            return;
        }

        // Configure adapter as needed
        obj.native.someConfig = 'test-value';
        harness.objects.setObject(obj._id, obj);

        await harness.startAdapterAndWait();

        // Wait for adapter to create states
        setTimeout(() => {
            // Access bulk states using pattern matching
            harness.dbConnection.getStateIDs('tagesschau.0.*').then(stateIds => {
                if (stateIds && stateIds.length > 0) {
                    harness.states.getStates(stateIds, (err, allStates) => {
                        if (err) {
                            console.error('❌ Error getting states:', err);
                            reject(err); // Properly fail the test instead of just resolving
                            return;
                        }

                        // Verify states were created and have expected values
                        const expectedStates = ['tagesschau.0.info.connection', 'tagesschau.0.articles.0.title'];
                        let foundStates = 0;
                        
                        for (const stateId of expectedStates) {
                            if (allStates[stateId]) {
                                foundStates++;
                                console.log(`✅ Found expected state: ${stateId}`);
                            } else {
                                console.log(`❌ Missing expected state: ${stateId}`);
                            }
                        }

                        if (foundStates === expectedStates.length) {
                            console.log('✅ All expected states were created successfully');
                            resolve();
                        } else {
                            reject(new Error(`Only ${foundStates}/${expectedStates.length} expected states were found`));
                        }
                    });
                } else {
                    reject(new Error('No states found matching pattern tagesschau.0.*'));
                }
            }).catch(reject);
        }, 20000); // Allow more time for multiple state creation
    });
})).timeout(45000);
```

#### Key Integration Testing Rules

1. **NEVER test API URLs directly** - Let the adapter handle API calls
2. **ALWAYS use the harness** - `getHarness()` provides the testing environment  
3. **Configure via objects** - Use `harness.objects.setObject()` to set adapter configuration
4. **Start properly** - Use `harness.startAdapterAndWait()` to start the adapter
5. **Check states** - Use `harness.states.getState()` to verify results
6. **Use timeouts** - Allow time for async operations with appropriate timeouts
7. **Test real workflow** - Initialize → Configure → Start → Verify States

#### Workflow Dependencies
Integration tests should run ONLY after lint and adapter tests pass:

```yaml
integration-tests:
  needs: [check-and-lint, adapter-tests]
  runs-on: ubuntu-latest
  steps:
    - name: Run integration tests
      run: npx mocha test/integration-*.js --exit
```

#### What NOT to Do
❌ Direct API testing: `axios.get('https://api.example.com')`
❌ Mock adapters: `new MockAdapter()`  
❌ Direct internet calls in tests
❌ Bypassing the harness system

#### What TO Do
✅ Use `@iobroker/testing` framework
✅ Configure via `harness.objects.setObject()`
✅ Start via `harness.startAdapterAndWait()`
✅ Test complete adapter lifecycle
✅ Verify states via `harness.states.getState()`
✅ Allow proper timeouts for async operations

### API Testing with Credentials
For adapters that connect to external APIs requiring authentication, implement comprehensive credential testing:

#### Password Encryption for Integration Tests
When creating integration tests that need encrypted passwords (like those marked as `encryptedNative` in io-package.json):

1. **Read system secret**: Use `harness.objects.getObjectAsync("system.config")` to get `obj.native.secret`
2. **Apply XOR encryption**: Implement the encryption algorithm:
   ```javascript
   async function encryptPassword(harness, password) {
       const systemConfig = await harness.objects.getObjectAsync("system.config");
       if (!systemConfig || !systemConfig.native || !systemConfig.native.secret) {
           throw new Error("Could not retrieve system secret for password encryption");
       }
       
       const secret = systemConfig.native.secret;
       let result = '';
       for (let i = 0; i < password.length; ++i) {
           result += String.fromCharCode(secret[i % secret.length].charCodeAt(0) ^ password.charCodeAt(i));
       }
       return result;
   }
   ```
3. **Store encrypted password**: Set the encrypted result in adapter config, not the plain text
4. **Result**: Adapter will properly decrypt and use credentials, enabling full API connectivity testing

#### Demo Credentials Testing Pattern
- Use provider demo credentials when available (e.g., `demo@api-provider.com` / `demo`)
- Create separate test file (e.g., `test/integration-demo.js`) for credential-based tests
- Add npm script: `"test:integration-demo": "mocha test/integration-demo --exit"`
- Implement clear success/failure criteria with recognizable log messages
- Expected success pattern: Look for specific adapter initialization messages
- Test should fail clearly with actionable error messages for debugging

#### Enhanced Test Failure Handling
```javascript
it("Should connect to API with demo credentials", async () => {
    // ... setup and encryption logic ...
    
    const connectionState = await harness.states.getStateAsync("adapter.0.info.connection");
    
    if (connectionState && connectionState.val === true) {
        console.log("✅ SUCCESS: API connection established");
        return true;
    } else {
        throw new Error("API Test Failed: Expected API connection to be established with demo credentials. " +
            "Check logs above for specific API errors (DNS resolution, 401 Unauthorized, network issues, etc.)");
    }
}).timeout(120000); // Extended timeout for API calls
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

## README Updates

### Required Sections
When updating README.md files, ensure these sections are present and well-documented:

1. **Installation** - Clear npm/ioBroker admin installation steps
2. **Configuration** - Detailed configuration options with examples
3. **Usage** - Practical examples and use cases
4. **Changelog** - Version history and changes (use "## **WORK IN PROGRESS**" section for ongoing changes following AlCalzone release-script standard)
5. **License** - License information (typically MIT for ioBroker adapters)
6. **Support** - Links to issues, discussions, and community support

### Documentation Standards
- Use clear, concise language
- Include code examples for configuration
- Add screenshots for admin interface when applicable
- Maintain multilingual support (at minimum English and German)
- When creating PRs, add entries to README under "## **WORK IN PROGRESS**" section following ioBroker release script standard
- Always reference related issues in commits and PR descriptions (e.g., "solves #xx" or "fixes #xx")

### Mandatory README Updates for PRs
For **every PR or new feature**, always add a user-friendly entry to README.md:

- Add entries under `## **WORK IN PROGRESS**` section before committing
- Use format: `* (author) **TYPE**: Description of user-visible change`
- Types: **NEW** (features), **FIXED** (bugs), **ENHANCED** (improvements), **TESTING** (test additions), **CI/CD** (automation)
- Focus on user impact, not technical implementation details
- Example: `* (DutchmanNL) **FIXED**: Adapter now properly validates login credentials instead of always showing "credentials missing"`

### Documentation Workflow Standards
- **Mandatory README updates**: Establish requirement to update README.md for every PR/feature
- **Standardized documentation**: Create consistent format and categories for changelog entries
- **Enhanced development workflow**: Integrate documentation requirements into standard development process

### Changelog Management with AlCalzone Release-Script
Follow the [AlCalzone release-script](https://github.com/AlCalzone/release-script) standard for changelog management:

#### Format Requirements
- Always use `## **WORK IN PROGRESS**` as the placeholder for new changes
- Add all PR/commit changes under this section until ready for release
- Never modify version numbers manually - only when merging to main branch
- Maintain this format in README.md or CHANGELOG.md:

```markdown
# Changelog

<!--
  Placeholder for the next version (at the beginning of the line):
  ## **WORK IN PROGRESS**
-->

## **WORK IN PROGRESS**

-   Did some changes
-   Did some more changes

## v0.1.0 (2023-01-01)
Initial release
```

#### Workflow Process
- **During Development**: All changes go under `## **WORK IN PROGRESS**`
- **For Every PR**: Add user-facing changes to the WORK IN PROGRESS section
- **Before Merge**: Version number and date are only added when merging to main
- **Release Process**: The release-script automatically converts the placeholder to the actual version

#### Change Entry Format
Use this consistent format for changelog entries:
- `- (author) **TYPE**: User-friendly description of the change`
- Types: **NEW** (features), **FIXED** (bugs), **ENHANCED** (improvements)
- Focus on user impact, not technical implementation details
- Reference related issues: "fixes #XX" or "solves #XX"

#### Example Entry
```markdown
## **WORK IN PROGRESS**

- (DutchmanNL) **FIXED**: Adapter now properly validates login credentials instead of always showing "credentials missing" (fixes #25)
- (DutchmanNL) **NEW**: Added support for device discovery to simplify initial setup
```

## Dependency Updates

### Package Management
- Always use `npm` for dependency management in ioBroker adapters
- When working on new features in a repository with an existing package-lock.json file, use `npm ci` to install dependencies. Use `npm install` only when adding or updating dependencies.
- Keep dependencies minimal and focused
- Only update dependencies to latest stable versions when necessary or in separate Pull Requests. Avoid updating dependencies when adding features that don't require these updates.
- When you modify `package.json`:
  1. Run `npm install` to update and sync `package-lock.json`.
  2. If `package-lock.json` was updated, commit both `package.json` and `package-lock.json`.

### Dependency Best Practices
- Prefer built-in Node.js modules when possible
- Use `@iobroker/adapter-core` for adapter base functionality
- Avoid deprecated packages
- Document any specific version requirements

## JSON-Config Admin Instructions

### Configuration Schema
When creating admin configuration interfaces:

- Use JSON-Config format for modern ioBroker admin interfaces
- Provide clear labels and help text for all configuration options
- Include input validation and error messages
- Group related settings logically
- Example structure:
  ```json
  {
    "type": "panel",
    "items": {
      "host": {
        "type": "text",
        "label": "Host address",
        "help": "IP address or hostname of the device"
      }
    }
  }
  ```

### Admin Interface Guidelines
- Use consistent naming conventions
- Provide sensible default values
- Include validation for required fields
- Add tooltips for complex configuration options
- Ensure translations are available for all supported languages (minimum English and German)
- Write end-user friendly labels and descriptions, avoiding technical jargon where possible

## Best Practices for Dependencies

### HTTP Client Libraries
- **Preferred:** Use native `fetch` API (Node.js 20+ required for adapters; built-in since Node.js 18)
- **Avoid:** `axios` unless specific features are required (reduces bundle size)

### Example with fetch:
```javascript
try {
  const response = await fetch('https://api.example.com/data');
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const data = await response.json();
} catch (error) {
  this.log.error(`API request failed: ${error.message}`);
}
```

### Other Dependency Recommendations
- **Logging:** Use adapter built-in logging (`this.log.*`)
- **Scheduling:** Use adapter built-in timers and intervals
- **File operations:** Use Node.js `fs/promises` for async file operations
- **Configuration:** Use adapter config system rather than external config libraries

## Error Handling

### Adapter Error Patterns
- Always catch and log errors appropriately
- Use adapter log levels (error, warn, info, debug)
- Provide meaningful, user-friendly error messages that help users understand what went wrong
- Handle network failures gracefully
- Implement retry mechanisms where appropriate
- Always clean up timers, intervals, and other resources in the `unload()` method

### Example Error Handling:
```javascript
try {
  await this.connectToDevice();
} catch (error) {
  this.log.error(`Failed to connect to device: ${error.message}`);
  this.setState('info.connection', false, true);
  // Implement retry logic if needed
}
```

### Timer and Resource Cleanup:
```javascript
// In your adapter class
private connectionTimer?: NodeJS.Timeout;

async onReady() {
  this.connectionTimer = setInterval(() => {
    this.checkConnection();
  }, 30000);
}

onUnload(callback) {
  try {
    // Clean up timers and intervals
    if (this.connectionTimer) {
      clearInterval(this.connectionTimer);
      this.connectionTimer = undefined;
    }
    // Close connections, clean up resources
    callback();
  } catch (e) {
    callback();
  }
}
```

## Code Style and Standards

- Follow JavaScript/TypeScript best practices
- Use async/await for asynchronous operations
- Implement proper resource cleanup in `unload()` method
- Use semantic versioning for adapter releases
- Include proper JSDoc comments for public methods

## CI/CD and Testing Integration

### GitHub Actions for API Testing
For adapters with external API dependencies, implement separate CI/CD jobs:

```yaml
# Tests API connectivity with demo credentials (runs separately)
demo-api-tests:
  if: contains(github.event.head_commit.message, '[skip ci]') == false
  
  runs-on: ubuntu-22.04
  
  steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Use Node.js 20.x
      uses: actions/setup-node@v4
      with:
        node-version: 20.x
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Run demo API tests
      run: npm run test:integration-demo
```

### CI/CD Best Practices
- Run credential tests separately from main test suite
- Use ubuntu-22.04 for consistency
- Don't make credential tests required for deployment
- Provide clear failure messages for API connectivity issues
- Use appropriate timeouts for external API calls (120+ seconds)

### Package.json Script Integration
Add dedicated script for credential testing:
```json
{
  "scripts": {
    "test:integration-demo": "mocha test/integration-demo --exit"
  }
}
```

### Practical Example: Complete API Testing Implementation
Here's a complete example based on lessons learned from the Discovergy adapter:

#### test/integration-demo.js
```javascript
const path = require("path");
const { tests } = require("@iobroker/testing");

// Helper function to encrypt password using ioBroker's encryption method
async function encryptPassword(harness, password) {
    const systemConfig = await harness.objects.getObjectAsync("system.config");
    
    if (!systemConfig || !systemConfig.native || !systemConfig.native.secret) {
        throw new Error("Could not retrieve system secret for password encryption");
    }
    
    const secret = systemConfig.native.secret;
    let result = '';
    for (let i = 0; i < password.length; ++i) {
        result += String.fromCharCode(secret[i % secret.length].charCodeAt(0) ^ password.charCodeAt(i));
    }
    
    return result;
}

// Run integration tests with demo credentials
tests.integration(path.join(__dirname, ".."), {
    defineAdditionalTests({ suite }) {
        suite("API Testing with Demo Credentials", (getHarness) => {
            let harness;
            
            before(() => {
                harness = getHarness();
            });

            it("Should connect to API and initialize with demo credentials", async () => {
                console.log("Setting up demo credentials...");
                
                if (harness.isAdapterRunning()) {
                    await harness.stopAdapter();
                }
                
                const encryptedPassword = await encryptPassword(harness, "demo_password");
                
                await harness.changeAdapterConfig("your-adapter", {
                    native: {
                        username: "demo@provider.com",
                        password: encryptedPassword,
                        // other config options
                    }
                });

                console.log("Starting adapter with demo credentials...");
                await harness.startAdapter();
                
                // Wait for API calls and initialization
                await new Promise(resolve => setTimeout(resolve, 60000));
                
                const connectionState = await harness.states.getStateAsync("your-adapter.0.info.connection");
                
                if (connectionState && connectionState.val === true) {
                    console.log("✅ SUCCESS: API connection established");
                    return true;
                } else {
                    throw new Error("API Test Failed: Expected API connection to be established with demo credentials. " +
                        "Check logs above for specific API errors (DNS resolution, 401 Unauthorized, network issues, etc.)");
                }
            }).timeout(120000);
        });
    }
});
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
- Current template version: 0.4.2

For issues or suggestions regarding these instructions, please visit the template repository.