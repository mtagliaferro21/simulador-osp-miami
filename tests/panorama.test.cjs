const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const sandbox = {window:{}, document:{createElement(){
  let image;
  return {getContext(){return {
    drawImage(value){image=value;},
    getImageData(){return {data:image.data};}
  };}};
}}};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root,'panorama.js'),'utf8'),sandbox);
vm.runInContext(fs.readFileSync(path.join(root,'photo-details.js'),'utf8'),sandbox);
let output;
const context = {
  createImageData(width,height){return {width,height,data:new Uint8ClampedArray(width*height*4)};},
  putImageData(frame){output=frame.data;}
};
const image=(pixels)=>({naturalWidth:2,naturalHeight:2,data:new Uint8ClampedArray(pixels.flat())});
const gray=image(Array(4).fill([128,128,128,255]));
const red=image(Array(4).fill([255,0,0,255]));
for(const [yaw,pitch] of [[0,0],[90,0],[180,0],[-85,-24],[40,55]]){
  const renderer=sandbox.createPanoramaSoftware(context);
  renderer.load(gray);
  renderer.loadDetail(red,{yaw,pitch,angle:40},0);
  renderer.draw(1,1,.2,.2,yaw*Math.PI/180,pitch*Math.PI/180);
  assert.deepEqual(Array.from(output),[255,0,0,255],'detail centered at its camera pose');
  renderer.draw(1,1,.2,.2,(yaw+180)*Math.PI/180,-pitch*Math.PI/180);
  assert.deepEqual(Array.from(output),[128,128,128,255],'opposite hemisphere retains base');
  renderer.dispose();
}
const renderer=sandbox.createPanoramaSoftware(context);
renderer.load(gray);
renderer.loadDetail(image([[255,0,0,255],[0,255,0,255],[0,0,255,255],[255,255,255,255]]),{yaw:0,pitch:0,angle:45},3);
renderer.draw(3,3,.75,.75,0,0);
assert.ok(output[0]>output[2],'top of detail is not vertically inverted');
assert.ok(output[24+2]>output[24],'bottom retains blue quadrant');
renderer.dispose();
let count=0;
for(const scene of sandbox.window.streetPhotoDetails) for(const detail of scene){
  assert.ok(fs.existsSync(path.join(root,detail.src)),detail.src);
  assert.ok(detail.angle>0 && detail.angle<90);
  count++;
}
assert.equal(count,21);
console.log('Passed: detail orientation, opposite hemisphere, vertical orientation, sparse loads and 21 assets.');
