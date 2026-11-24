"use strict";

function createPanoramaGraphics(gl) {
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

  return {
    density: (width) => Math.min(window.devicePixelRatio || 1, 2, 1800 / width),
    load(image) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    },
    draw(width, height, halfWidth, halfHeight, yaw, pitch) {
      gl.viewport(0, 0, width, height);
      gl.uniform2f(spread, halfWidth, halfHeight);
      gl.uniform2f(turn, yaw, pitch);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose() {
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      shaders.forEach(shader => gl.deleteShader(shader));
      gl.deleteProgram(program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}

function createPanoramaSoftware(context) {
  let texture;
  let textureWidth;
  let textureHeight;
  let frame;
  let rays;
  let rayHalfWidth;
  let rayHalfHeight;
  return {
    density: (width, height) => Math.min(1, 800 / width, 480 / height),
    load(image) {
      const source = document.createElement("canvas");
      textureWidth = source.width = image.naturalWidth;
      textureHeight = source.height = image.naturalHeight;
      const sourceContext = source.getContext("2d", { willReadFrequently: true });
      sourceContext.drawImage(image, 0, 0);
      texture = new Uint32Array(sourceContext.getImageData(0, 0, textureWidth, textureHeight).data.buffer);
    },
    draw(width, height, halfWidth, halfHeight, yaw, pitch) {
      const frameChanged = !frame || frame.width !== width || frame.height !== height;
      if (frameChanged) {
        frame = context.createImageData(width, height);
      }
      if (!rays || frameChanged || rayHalfWidth !== halfWidth || rayHalfHeight !== halfHeight) {
        rayHalfWidth = halfWidth;
        rayHalfHeight = halfHeight;
        rays = new Float32Array(width * height * 3);
        let i = 0;
        for (let row = 0; row < height; row++) {
          const y = (1 - (row + .5) * 2 / height) * halfHeight;
          for (let column = 0; column < width; column++) {
            const x = ((column + .5) * 2 / width - 1) * halfWidth;
            const inv = 1 / Math.sqrt(x * x + y * y + 1);
            rays[i++] = x * inv;
            rays[i++] = y * inv;
            rays[i++] = inv;
          }
        }
      }
      const result = new Uint32Array(frame.data.buffer);
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      const longitudeScale = textureWidth / (2 * Math.PI);
      const latitudeScale = textureHeight / Math.PI;
      const yawOffset = textureWidth / 2 + yaw * longitudeScale;
      for (let j = 0, i = 0; j < result.length; j++, i += 3) {
        const y = rays[i + 1], z = rays[i + 2];
        const longitude = Math.atan2(rays[i], cp * z - sp * y);
        const latitude = Math.asin(Math.max(-1, Math.min(1, cp * y + sp * z)));
        const sx = ((Math.floor(yawOffset + longitude * longitudeScale) % textureWidth) + textureWidth) % textureWidth;
        const sy = Math.min(textureHeight - 1, Math.floor(textureHeight / 2 - latitude * latitudeScale));
        result[j] = texture[sy * textureWidth + sx];
      }
      context.putImageData(frame, 0, 0);
    },
    dispose() { texture = null; frame = null; rays = null; },
  };
}

window.createStreetPanorama = function createStreetPanorama(canvas, pins, src, onReady) {
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false });
  const context = gl ? null : canvas.getContext("2d", { alpha: false });
  const renderer = gl ? createPanoramaGraphics(gl) : context ? createPanoramaSoftware(context) : null;
  if (!renderer) return null;

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
  let targetPitch = 0;
  let zoom = 1;
  let scheduled = 0;
  const image = new Image();

  function draw() {
    scheduled = 0;
    if (!loaded || disposed) return;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    const density = renderer.density(width, height);
    const pixelWidth = Math.round(width * density), pixelHeight = Math.round(height * density);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const aspect = width / height;
    // Use a restrained rectilinear field of view on both wide and tall screens.
    const halfWidth = Math.min(Math.tan(40 * Math.PI / 180), .59 * aspect) / zoom;
    const halfHeight = halfWidth / aspect;
    // Keep the texture's polar regions outside the view at every zoom level.
    const pitchLimit = Math.min(66 * Math.PI / 180, 80 * Math.PI / 180 - Math.atan(halfHeight));
    const pitch = Math.max(-pitchLimit, Math.min(pitchLimit, targetPitch));
    renderer.draw(pixelWidth, pixelHeight, halfWidth, halfHeight, yaw, pitch);

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
  function update(x, y, magnification = 1) {
    yaw = (-x * .005) % (2 * Math.PI);
    targetPitch = y * .005;
    zoom = magnification;
    if (loaded && !scheduled) scheduled = requestAnimationFrame(draw);
  }
  image.onload = () => {
    if (disposed) return;
    try {
      renderer.load(image);
      loaded = true;
      onReady(true);
      draw();
    } catch (error) {
      console.warn("No se pudo preparar el panorama", error);
      onReady(false);
    }
  };
  image.onerror = () => { if (!disposed) onReady(false); };
  canvas.addEventListener("webglcontextlost", () => { if (!disposed) onReady(false); });
  image.src = src;
  return {
    update,
    dispose() {
      disposed = true;
      cancelAnimationFrame(scheduled);
      renderer.dispose();
    },
  };
};
