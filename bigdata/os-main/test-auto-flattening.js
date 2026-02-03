/**
 * Test script for Auto-Flattening feature
 * Tests the enhanced translation system with fallback logic
 *
 * Usage:
 *   node test-auto-flattening.js
 */

const PORT = process.env.PORT || 3200;
const BASE_URL = `http://localhost:${PORT}`;
const BRANCH_ID = 'aqar';
const MODULE_ID = 'brocker';

async function testAutoFlattening() {
  console.log('=== Testing Auto-Flattening Feature ===\n');

  const tests = [
    {
      name: 'Test 1: Request Arabic (should work)',
      url: `${BASE_URL}/api/modules/${BRANCH_ID}/${MODULE_ID}?lang=ar`,
      expectedLang: 'ar'
    },
    {
      name: 'Test 2: Request English (should fallback to Arabic if not found)',
      url: `${BASE_URL}/api/modules/${BRANCH_ID}/${MODULE_ID}?lang=en`,
      expectedLang: 'en', // or 'ar' if English not available
      allowFallback: true
    },
    {
      name: 'Test 3: No lang specified (should use default Arabic)',
      url: `${BASE_URL}/api/modules/${BRANCH_ID}/${MODULE_ID}`,
      expectedLang: 'ar'
    },
    {
      name: 'Test 4: Strict mode (no fallback)',
      url: `${BASE_URL}/api/modules/${BRANCH_ID}/${MODULE_ID}?lang=fr&strict=1`,
      expectedLang: null, // No translation expected
      allowEmpty: true
    },
    {
      name: 'Test 5: Custom default language',
      url: `${BASE_URL}/api/modules/${BRANCH_ID}/${MODULE_ID}?lang=fr&defaultLang=en`,
      expectedLang: 'en',
      allowFallback: true
    }
  ];

  for (const test of tests) {
    console.log(`\n📋 ${test.name}`);
    console.log(`   URL: ${test.url}`);

    try {
      const response = await fetch(test.url);
      const data = await response.json();

      if (!response.ok) {
        console.log(`   ❌ FAILED: HTTP ${response.status}`);
        console.log(`   Error:`, data);
        continue;
      }

      // Check snapshot structure
      if (!data.tables) {
        console.log(`   ❌ FAILED: No tables in response`);
        continue;
      }

      console.log(`   ✅ SUCCESS: Got snapshot with ${Object.keys(data.tables).length} tables`);
      console.log(`   Snapshot lang: ${data._lang || 'not specified'}`);

      // Check a sample table with translations (e.g., projects)
      const projects = data.tables.projects || [];
      if (projects.length > 0) {
        const firstProject = projects[0];
        console.log(`\n   Sample project:`);
        console.log(`     ID: ${firstProject.id}`);
        console.log(`     Name: ${firstProject.project_name || '(no name)'}`);
        console.log(`     Lang used: ${firstProject._lang_used || 'not specified'}`);
        console.log(`     Lang requested: ${firstProject._lang_requested || 'none'}`);
        console.log(`     Fallback: ${firstProject._lang_fallback ? 'YES' : 'NO'}`);

        // Validate
        if (test.expectedLang && firstProject._lang_used !== test.expectedLang && !test.allowFallback) {
          console.log(`   ⚠️  WARNING: Expected lang '${test.expectedLang}', got '${firstProject._lang_used}'`);
        }
      } else {
        console.log(`   ℹ️  No projects in database`);
      }

      // Check regions
      const regions = data.tables.regions || [];
      if (regions.length > 0) {
        const firstRegion = regions[0];
        console.log(`\n   Sample region:`);
        console.log(`     ID: ${firstRegion.id}`);
        console.log(`     Name: ${firstRegion.name || '(no name)'}`);
        console.log(`     Lang used: ${firstRegion._lang_used || 'not specified'}`);
      }

    } catch (error) {
      console.log(`   ❌ FAILED: ${error.message}`);
    }
  }

  console.log('\n\n=== Test Summary ===');
  console.log('Auto-Flattening feature test completed.');
  console.log('Check the output above to verify behavior.\n');
}

// Run tests
testAutoFlattening().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
