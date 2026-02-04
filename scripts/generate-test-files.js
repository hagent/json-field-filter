const fs = require('fs');
const path = require('path');

function generateRecord(index) {
  return {
    id: index,
    name: `User ${index}`,
    email: `user${index}@example.com`,
    age: 20 + (index % 50),
    isActive: index % 2 === 0,
    createdAt: new Date(Date.now() - index * 86400000).toISOString(),
    address: {
      street: `${index} Main Street`,
      city: ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix'][index % 5],
      zipCode: String(10000 + index),
      country: 'USA'
    },
    tags: ['tag1', 'tag2', 'tag3'].slice(0, (index % 3) + 1),
    metadata: {
      source: 'generated',
      version: index % 10,
      flags: {
        verified: index % 3 === 0,
        premium: index % 5 === 0
      }
    }
  };
}

function generateFile(outputPath, targetSizeMB) {
  const targetSize = targetSizeMB * 1024 * 1024;
  const stream = fs.createWriteStream(outputPath);

  stream.write('[\n');

  let currentSize = 2; // for "[\n"
  let index = 0;
  let isFirst = true;

  while (currentSize < targetSize) {
    const record = generateRecord(index);
    const json = JSON.stringify(record, null, 2);
    const prefix = isFirst ? '' : ',\n';
    const chunk = prefix + json;

    stream.write(chunk);
    currentSize += chunk.length;
    isFirst = false;
    index++;

    if (index % 10000 === 0) {
      console.log(`Generated ${index} records, ${(currentSize / 1024 / 1024).toFixed(2)} MB`);
    }
  }

  stream.write('\n]');
  stream.end();

  console.log(`Done: ${outputPath} (${index} records, ${(currentSize / 1024 / 1024).toFixed(2)} MB)`);
}

const testFilesDir = path.join(__dirname, '..', 'test-files');
if (!fs.existsSync(testFilesDir)) {
  fs.mkdirSync(testFilesDir, { recursive: true });
}

// Generate medium file (~10MB)
generateFile(path.join(testFilesDir, 'medium.json'), 10);

// Uncomment to generate large file (~100MB)
// generateFile(path.join(testFilesDir, 'large.json'), 100);

console.log('\nTest files generated in:', testFilesDir);
