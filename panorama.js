"use strict";

function createPanoramaGraphics(gl) {
  const vertex = "attribute vec2 p; varying vec2 uv; void main(){uv=p;gl_Position=vec4(p,0.,1.);}";
  const fragment = `
    precision highp float;
    varying vec2 uv;
    uniform sampler2D photo;
    uniform vec2 spread;
    uniform vec2 turn;
    uniform sampler2D detail0;
    uniform sampler2D detail1;
    uniform sampler2D detail2;
    uniform sampler2D detail3;
    uniform sampler2D detail4;
    uniform vec4 detailCamera[5];
    uniform float detailReady[5];
    const float PI = 3.141592653589793;
    vec4 projectDetail(vec3 v, vec4 camera) {
      float cy = cos(camera.x), sy = sin(camera.x);
      float cp = cos(camera.y), sp = sin(camera.y);
      float forward = sy*v.x+cy*v.z;
      float depth = sp*v.y+cp*forward;
      vec2 q = vec2(cy*v.x-sy*v.z, sp*forward-cp*v.y) / max(depth, .00001);
      q /= camera.zw;
      vec2 edge = smoothstep(vec2(0.), vec2(.18), vec2(1.)-abs(q));
      return vec4(q*.5+.5, edge.x*edge.y*step(.00001,depth), 1.);
    }
    void main(){
      vec3 v = normalize(vec3(uv * spread, 1.0));
      float c = cos(turn.y), s = sin(turn.y);
      v = vec3(v.x, c*v.y+s*v.z, c*v.z-s*v.y);
      c = cos(turn.x); s = sin(turn.x);
      v = vec3(c*v.x+s*v.z, v.y, c*v.z-s*v.x);
      vec2 st = vec2(fract(.5+atan(v.x,v.z)/(2.0*PI)), .5-asin(clamp(v.y,-1.0,1.0))/PI);
      vec3 base = texture2D(photo, st).rgb;
      float luminance = dot(base, vec3(.2126,.7152,.0722));
      // Neutral exposure in the retained peripheral imagery; never sharpen halos.
      vec4 color = vec4((mix(vec3(luminance),base,.83)-.5)*.96+.5,1.);
      vec4 d = projectDetail(v, detailCamera[0]);
      color = mix(color, texture2D(detail0,d.xy), d.z*detailReady[0]);
      d = projectDetail(v, detailCamera[1]);
      color = mix(color, texture2D(detail1,d.xy), d.z*detailReady[1]);
      d = projectDetail(v, detailCamera[2]);
      color = mix(color, texture2D(detail2,d.xy), d.z*detailReady[2]);
      d = projectDetail(v, detailCamera[3]);
      color = mix(color, texture2D(detail3,d.xy), d.z*detailReady[3]);
      d = projectDetail(v, detailCamera[4]);
      color = mix(color, texture2D(detail4,d.xy), d.z*detailReady[4]);
      gl_FragColor = vec4(color.rgb, 1.);
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
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const spread = gl.getUniformLocation(program, "spread");
  const turn = gl.getUniformLocation(program, "turn");
  const detailTextures = [];
  const detailCameras = gl.getUniformLocation(program, "detailCamera[0]");
  const detailReady = gl.getUniformLocation(program, "detailReady[0]");
  const cameraValues = new Float32Array(20);
  const readyValues = new Float32Array(5);
  for (let i = 0; i < 5; i++) {
    cameraValues.set([0,0,1,1], i*4);
    gl.activeTexture(gl.TEXTURE0+i+1);
    const tile = gl.createTexture();
    detailTextures.push(tile);
    gl.bindTexture(gl.TEXTURE_2D,tile);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,255]));
    gl.uniform1i(gl.getUniformLocation(program,`detail${i}`),i+1);
  }
  gl.uniform4fv(detailCameras,cameraValues);
  gl.uniform1fv(detailReady,readyValues);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.uniform1i(gl.getUniformLocation(program,"photo"),0);

  return {
    density: (width,height) => Math.min(window.devicePixelRatio || 1, 2, 3840 / width, Math.sqrt(6000000/(width*height))),
    load(image) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D,texture);
      let source = image;
      if (image.naturalWidth > maxTextureSize) {
        source = document.createElement("canvas");
        source.width = maxTextureSize;
        source.height = maxTextureSize / 2;
        const context = source.getContext("2d");
        context.imageSmoothingQuality = "high";
        context.drawImage(image, 0, 0, source.width, source.height);
      }
      // WebGL 1 requires clamp-to-edge for textures whose dimensions aren't powers of two.
      const width = source.naturalWidth ?? source.width;
      const height = source.naturalHeight ?? source.height;
      const powerOfTwo = (width & (width - 1)) === 0 && (height & (height - 1)) === 0;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, powerOfTwo ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    },
    loadDetail(image, spec, index) {
      if (index >= detailTextures.length || image.naturalWidth > maxTextureSize || image.naturalHeight > maxTextureSize) return;
      gl.activeTexture(gl.TEXTURE0+index+1);
      gl.bindTexture(gl.TEXTURE_2D,detailTextures[index]);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
      const halfWidth = Math.tan(spec.angle*Math.PI/180);
      cameraValues.set([spec.yaw*Math.PI/180,spec.pitch*Math.PI/180,halfWidth,halfWidth*image.naturalHeight/image.naturalWidth],index*4);
      readyValues[index] = 1;
      gl.uniform4fv(detailCameras,cameraValues);
      gl.uniform1fv(detailReady,readyValues);
      gl.activeTexture(gl.TEXTURE0);
    },
    draw(width, height, halfWidth, halfHeight, yaw, pitch) {
      gl.viewport(0, 0, width, height);
      gl.uniform2f(spread, halfWidth, halfHeight);
      gl.uniform2f(turn, yaw, pitch);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose() {
      gl.deleteTexture(texture);
      detailTextures.forEach(tile => gl.deleteTexture(tile));
      gl.deleteBuffer(buffer);
      shaders.forEach(shader => gl.deleteShader(shader));
      gl.deleteProgram(program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}

function createPanoramaSoftware(context) {
  const details = [];
  let texture;
  let textureWidth;
  let textureHeight;
  let frame;
  let rays;
  let rayHalfWidth;
  let rayHalfHeight;
  return {
    density: (width, height, moving) => moving
      ? Math.min(1, 900 / width, 520 / height)
      : Math.min(1, 1440 / width, 800 / height),
    load(image) {
      const source = document.createElement("canvas");
      textureWidth = source.width = image.naturalWidth;
      textureHeight = source.height = image.naturalHeight;
      const sourceContext = source.getContext("2d", { willReadFrequently: true });
      sourceContext.drawImage(image, 0, 0);
      texture = sourceContext.getImageData(0, 0, textureWidth, textureHeight).data;
    },
    loadDetail(image, spec, index) {
      const source = document.createElement("canvas");
      source.width = image.naturalWidth;
      source.height = image.naturalHeight;
      const ctx = source.getContext("2d", {willReadFrequently: true});
      ctx.drawImage(image,0,0);
      const yaw = spec.yaw*Math.PI/180, pitch = spec.pitch*Math.PI/180;
      details[index] = {data:ctx.getImageData(0,0,source.width,source.height).data,
        width:source.width,height:source.height, cy:Math.cos(yaw),sy:Math.sin(yaw),
        cp:Math.cos(pitch),sp:Math.sin(pitch),sx:Math.tan(spec.angle*Math.PI/180),
        sz:Math.tan(spec.angle*Math.PI/180)*source.height/source.width};
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
      const result = frame.data;
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const longitudeScale = textureWidth / (2 * Math.PI);
      const latitudeScale = textureHeight / Math.PI;
      const yawOffset = textureWidth / 2 + yaw * longitudeScale - .5;
      for (let j = 0, i = 0; j < result.length; j += 4, i += 3) {
        const y = rays[i + 1], z = rays[i + 2];
        const longitude = Math.atan2(rays[i], cp * z - sp * y);
        const latitude = Math.asin(Math.max(-1, Math.min(1, cp * y + sp * z)));
        const u = yawOffset + longitude * longitudeScale;
        const v = Math.max(0, Math.min(textureHeight - 1, textureHeight / 2 - latitude * latitudeScale - .5));
        const floorU = Math.floor(u);
        const left = ((floorU % textureWidth) + textureWidth) % textureWidth;
        const right = (left + 1) % textureWidth;
        const top = Math.floor(v);
        const bottom = Math.min(top + 1, textureHeight - 1);
        const xWeight = u - floorU, yWeight = v - top;
        const topLeft = (top * textureWidth + left) * 4;
        const topRight = (top * textureWidth + right) * 4;
        const bottomLeft = (bottom * textureWidth + left) * 4;
        const bottomRight = (bottom * textureWidth + right) * 4;
        for (let channel = 0; channel < 3; channel++) {
          const upper = texture[topLeft + channel] * (1 - xWeight) + texture[topRight + channel] * xWeight;
          const lower = texture[bottomLeft + channel] * (1 - xWeight) + texture[bottomRight + channel] * xWeight;
          result[j + channel] = upper * (1 - yWeight) + lower * yWeight;
        }
        const luminance = result[j]*.2126+result[j+1]*.7152+result[j+2]*.0722;
        for(let channel=0;channel<3;channel++) result[j+channel] = (luminance*.17+result[j+channel]*.83-127.5)*.96+127.5;
        const vz=cp*z-sp*y, worldX=cy*rays[i]+sy*vz, worldY=cp*y+sp*z, worldZ=cy*vz-sy*rays[i];
        for (const tile of details) {
          if (!tile) continue;
          const forward=tile.sy*worldX+tile.cy*worldZ, depth=tile.sp*worldY+tile.cp*forward;
          if(depth<=0) continue;
          const qx=(tile.cy*worldX-tile.sy*worldZ)/(depth*tile.sx);
          const qy=(tile.sp*forward-tile.cp*worldY)/(depth*tile.sz);
          if(Math.abs(qx)>=1 || Math.abs(qy)>=1) continue;
          const ex=Math.min(1,(1-Math.abs(qx))/.18), ey=Math.min(1,(1-Math.abs(qy))/.18);
          const alpha=ex*ex*(3-2*ex)*ey*ey*(3-2*ey);
          const tx=Math.max(0,Math.min(tile.width-1,(qx*.5+.5)*tile.width-.5));
          const ty=Math.max(0,Math.min(tile.height-1,(qy*.5+.5)*tile.height-.5));
          const ix=Math.floor(tx),iy=Math.floor(ty),fx=tx-ix,fy=ty-iy;
          const a=(iy*tile.width+ix)*4,b=(iy*tile.width+Math.min(ix+1,tile.width-1))*4;
          const c=(Math.min(iy+1,tile.height-1)*tile.width+ix)*4,d=(Math.min(iy+1,tile.height-1)*tile.width+Math.min(ix+1,tile.width-1))*4;
          for(let channel=0;channel<3;channel++) {
            const value=(tile.data[a+channel]*(1-fx)+tile.data[b+channel]*fx)*(1-fy)+(tile.data[c+channel]*(1-fx)+tile.data[d+channel]*fx)*fy;
            result[j+channel]=result[j+channel]*(1-alpha)+value*alpha;
          }
        }
        result[j + 3] = 255;
      }
      context.putImageData(frame, 0, 0);
    },
    dispose() { texture = null; frame = null; rays = null; details.length = 0; },
  };
}

window.createStreetPanorama = function createStreetPanorama(canvas, pins, src, onReady, details = []) {
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
  let settleTimer = 0;
  const image = new Image();
  const detailImages = [];

  function draw() {
    scheduled = 0;
    if (!loaded || disposed) return;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    const density = renderer.density(width, height, settleTimer !== 0);
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
    if (!loaded) return;
    if (!gl) {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        settleTimer = 0;
        if (!scheduled) scheduled = requestAnimationFrame(draw);
      }, 140);
    }
    if (!scheduled) scheduled = requestAnimationFrame(draw);
  }
  image.onload = () => {
    if (disposed) return;
    try {
      renderer.load(image);
      loaded = true;
      onReady(true);
      draw();
      // Independent rectilinear detail textures retain their native samples.
      // A failed optional tile leaves the complete 360-degree panorama available.
      if (renderer.loadDetail) details.slice(0,5).forEach((spec,index) => {
        const tile = new Image();
        detailImages.push(tile);
        tile.onload = () => {
          if (disposed) return;
          try {
            renderer.loadDetail(tile,spec,index);
            if (!scheduled) scheduled = requestAnimationFrame(draw);
          } catch (error) { console.warn("Detail image unavailable",spec.src,error); }
        };
        tile.src = spec.src;
      });
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
      clearTimeout(settleTimer);
      image.onload = image.onerror = null;
      detailImages.forEach(tile => { tile.onload = tile.onerror = null; tile.src = ""; });
      renderer.dispose();
    },
  };
};
