// UX correction: only real binary parts belong in the download result.
const createBinaryResult = window.result;
window.result = function (name, blob, isPart = true) {
  if (name.endsWith('.splitx.txt')) return;
  const binaryPart = isPart
    ? new Blob([blob], { type: 'application/octet-stream' })
    : blob;
  return createBinaryResult(name, binaryPart, isPart);
};
