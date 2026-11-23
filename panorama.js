"use strict";

window.createStreetPanorama = function createStreetPanorama(canvas, pins, src, onReady) {
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false });
  if (!gl) return null;
  const vertex = "attribute vec2 p; varying vec2 uv; void main(){uv=p;gl_Position=vec4(p,0.,1.);}";
  const fragment = `
    precision highp float;
    varying vec2 uv;
    uniform sampler2D photo;
    uniform vec2 spread;
    uniform vec2 turn;
    const float PI = 3.141592653589793;
    void main(){
      vec3 v = normalize(vec3(uv * spread, 1.0));
      float c = cos(turn.y), s = sin(turn.y);
      v = vec3(v.x, c*v.y+s*v.z, c*v.z-s*v.y);
      c = cos(turn.x); s = sin(turn.x);
      v = vec3(c*v.x+s*v.z, v.y, c*v.z-s*v.x);
      vec2 st = vec2(fract(.5+atan(v.x,v.z)/(2.0*PI)), .5-asin(clamp(v.y,-1.0,1.0))/PI);
      gl_FragColor = texture2D(photo, st);
    }`;
  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }
  const program = gl.createProgram();
  const shaders = [compile(gl.VERTEX_SHADER, vertex), compile(gl.FRAGMENT_SHADER, fragment)];
  shaders.forEach(shader => gl.attachShader(program, shader));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const p = gl.getAttribLocation(program, "p");
  gl.enableVertexAttribArray(p);
  gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const spread = gl.getUniformLocation(program, "spread");
  const turn = gl.getUniformLocation(program, "turn");

  // Each asset is anchored to a longitude and latitude on the panorama.
  const tau = 2 * Math.PI;
  const anchors = pins.map(element => {
    const longitude = (Number(element.dataset.photoX) / 100 - .5) * tau;
    const latitude = (.5 - Number(element.dataset.photoY) / 100) * Math.PI;
    return { element, x: Math.sin(longitude) * Math.cos(latitude),
      y: Math.sin(latitude), z: Math.cos(longitude) * Math.cos(latitude) };
  });
  let loaded = false;
  let disposed = false;
  let yaw = 0;
  let pitch = 0;
  let scheduled = 0;
  const image = new Image();

  function draw() {
    scheduled = 0;
    if (!loaded || disposed) return;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    const density = Math.min(window.devicePixelRatio || 1, 2, 1800 / width);
    const pixelWidth = Math.round(width * density), pixelHeight = Math.round(height * density);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const aspect = width / height;
    const halfWidth = Math.min(Math.tan(51 * Math.PI / 180), .77 * aspect);
    const halfHeight = halfWidth / aspect;
    gl.viewport(0, 0, pixelWidth, pixelHeight);
    gl.uniform2f(spread, halfWidth, halfHeight);
    gl.uniform2f(turn, yaw, pitch);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    for (const { element, x, y, z } of anchors) {
      const side = cy * x - sy * z;
      const forward = sy * x + cy * z;
      const up = cp * y - sp * forward;
      const depth = sp * y + cp * forward;
      const u = side / (depth * halfWidth);
      const v = up / (depth * halfHeight);
      const clipped = depth <= 0 || Math.abs(u) > .98 || Math.abs(v) > .98;
      element.hidden = clipped;
      if (!clipped) {
        element.style.left = `${(1 + u) * 50}%`;
        element.style.top = `${(1 - v) * 50}%`;
      }
    }
  }
  function update(x, y) {
    yaw = (-x * .005) % (2 * Math.PI);
    pitch = Math.max(-1.45, Math.min(1.45, y * .005));
    if (loaded && !scheduled) scheduled = requestAnimationFrame(draw);
  }
  image.onload = () => {
    if (disposed) return;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    loaded = true;
    onReady(true);
    draw();
  };
  image.onerror = () => { if (!disposed) onReady(false); };
  canvas.addEventListener("webglcontextlost", () => { if (!disposed) onReady(false); });
  image.src = src;
  return {
    update,
    dispose() {
      disposed = true;
      cancelAnimationFrame(scheduled);
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      shaders.forEach(shader => gl.deleteShader(shader));
      gl.deleteProgram(program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
};
