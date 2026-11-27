"use strict";
// Native rectilinear photo-style images, projected at their original camera angles.
// These synthetic teaching images do not establish field conditions or ownership.
window.streetPhotoDetails = ["principal","tramo","continuous","lateral","utility"].map((scene,index) => {
  const poses = [
    ["front",0,index === 3 ? -9 : 0,index === 2 ? 51 : 48],
    ["rear",180,0,index === 2 || index === 4 ? 51 : 48],
    ["right",85,index === 2 ? 0 : -22,index === 2 ? 48 : 39],
    ["left",-85,-24,39],
  ];
  if (index === 4) {
    poses[0] = ["front",10.886,-6.3025357464,42];
    poses[1] = ["rear",180,0,44];
    poses.push(["pole",40,55,40]);
  }
  return poses.map(([direction,yaw,pitch,angle]) => ({src:`./photos/${scene}-${direction}.webp`,yaw,pitch,angle}));
});
