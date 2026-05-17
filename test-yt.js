const dlcore = require('sadaslk-dlcore');

async function testIg() {
  try {
    const res = await dlcore.instagram('https://www.instagram.com/p/Co08z9-py_B/');
    console.log('Result:', res);
  } catch (e) {
    console.error('Error:', e.message);
  }
}

testIg();
