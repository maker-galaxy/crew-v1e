const DEFAULT_ROAD_CONFIG = Object.freeze({
  view: {
    width: 760,
    height: 780,
    topY: 24,
    bottomInset: 16,
    edgeInset: 5,
  },
  startEnd: {
    centerXRatio: 0.5,
    topFadeToZeroY: 20,
  },
  width: {
    minBottomPx: 120,
    maxBottomRatio: 0.62,
    taperExponent: 3.25,
  },
  curve: {
    amplitudeRatio: 0.19,
    frequency: 3.6,
    phase: -0.6,
    envelopeExponent: 1.35,
  },
  pathSampling: {
    pathSteps: 120,
  },
  seams: {
    rowStartOffsetY: 2,
    rowHeightMin: 2.4,
    rowHeightRange: 20,
    rowHeightExponent: 1.7,
    minRoadWidthForSeams: 7,
    sideInsetMin: 1.4,
    sideInsetRatio: 0.045,
    horizontalStrokeMin: 0.45,
    horizontalStrokeRange: 1.65,
    brickWidthMin: 3.8,
    brickWidthRange: 26,
    brickWidthExponent: 1.55,
    verticalStrokeMin: 0.3,
    verticalStrokeRange: 0.9,
    verticalInsetY: 0.7,
  },
  mask: {
    solidStop: 0.28,
    midStop: 0.52,
    nearTopStop: 0.70,
  },
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pickAnchor(root, anchorSelector) {
  const explicitAnchor = root.querySelector(anchorSelector);
  if (explicitAnchor) {
    return explicitAnchor;
  }

  const pills = Array.from(root.querySelectorAll('.pill[data-choice]'));
  if (!pills.length) {
    return null;
  }

  const middleIndex = Math.floor((pills.length - 1) / 2);
  return pills[middleIndex];
}

export function initYellowBrickRoad(options = {}) {
  const {
    root = document.getElementById('chooserRoot'),
    roadSelector = '.goldRoad',
    anchorSelector = '.pill--kits',
    roadConfig = DEFAULT_ROAD_CONFIG,
    queryParam = 'road',
  } = options;

  if (!root) {
    return { renderRoad: () => {}, scheduleRender: () => {}, destroy: () => {} };
  }

  const goldRoadSvg = root.querySelector(roadSelector);
  const goldRoadShape = root.querySelector('#goldRoadShape');
  const goldRoadCenterline = root.querySelector('#goldRoadCenterline');
  const goldRoadSeams = root.querySelector('#goldRoadSeams');
  const roadMaskStop0 = root.querySelector('#roadMaskStop0');
  const roadMaskStop1 = root.querySelector('#roadMaskStop1');
  const roadMaskStop2 = root.querySelector('#roadMaskStop2');
  const roadMaskStop3 = root.querySelector('#roadMaskStop3');
  const roadMaskStop4 = root.querySelector('#roadMaskStop4');
  const roadMaskStop5 = root.querySelector('#roadMaskStop5');

  if (!goldRoadSvg || !goldRoadShape || !goldRoadCenterline || !goldRoadSeams) {
    return { renderRoad: () => {}, scheduleRender: () => {}, destroy: () => {} };
  }

  const anchorPill = pickAnchor(root, anchorSelector);
  let renderRaf = 0;

  const applyRoadFeatureFlag = () => {
    const params = new URLSearchParams(window.location.search);
    const roadOverride = (params.get(queryParam) || '').trim().toLowerCase();
    root.classList.remove('ff-road-on', 'ff-road-off');
    if (roadOverride === 'on') {
      root.classList.add('ff-road-on');
    } else if (roadOverride === 'off') {
      root.classList.add('ff-road-off');
    }
  };

  const buildRoadFromMath = () => {
    const vb = goldRoadSvg.viewBox.baseVal;
    const viewW = vb.width || roadConfig.view.width;
    const viewH = vb.height || roadConfig.view.height;
    const yTop = roadConfig.view.topY;
    const yBottom = viewH - roadConfig.view.bottomInset;
    const ySpan = yBottom - yTop;

    if (roadMaskStop0 && roadMaskStop1 && roadMaskStop2 && roadMaskStop3 && roadMaskStop4 && roadMaskStop5) {
      const fadeZeroOffset = clamp((viewH - roadConfig.startEnd.topFadeToZeroY) / viewH, 0, 1);
      roadMaskStop0.setAttribute('offset', '0');
      roadMaskStop1.setAttribute('offset', String(roadConfig.mask.solidStop));
      roadMaskStop2.setAttribute('offset', String(roadConfig.mask.midStop));
      roadMaskStop3.setAttribute('offset', String(roadConfig.mask.nearTopStop));
      roadMaskStop4.setAttribute('offset', String(fadeZeroOffset));
      roadMaskStop5.setAttribute('offset', '1');
    }

    const roadRect = goldRoadSvg.getBoundingClientRect();
    const pillRect = anchorPill?.getBoundingClientRect();
    const roadPxW = Math.max(roadRect.width, 1);
    const viewPerPx = viewW / roadPxW;

    const pillStyle = anchorPill ? getComputedStyle(anchorPill) : null;
    const pillRadiusPx = pillStyle ? parseFloat(pillStyle.getPropertyValue('--pill-radius')) || 64 : 64;
    const pillWidthPx = pillRect ? pillRect.width : 380;

    const bottomWidthPx = Math.max(roadConfig.width.minBottomPx, pillWidthPx - (2 * pillRadiusPx));
    const bottomWidth = clamp(
      bottomWidthPx * viewPerPx,
      roadConfig.width.minBottomPx,
      viewW * roadConfig.width.maxBottomRatio,
    );

    const baseCenterX = viewW * roadConfig.startEnd.centerXRatio;
    const swayAmp = viewW * roadConfig.curve.amplitudeRatio;
    const swayFreq = roadConfig.curve.frequency;
    const swayPhase = roadConfig.curve.phase;
    const edgeInset = roadConfig.view.edgeInset;

    const widthAt = (t) => bottomWidth * Math.pow(t, roadConfig.width.taperExponent);
    const centerAt = (t) => {
      const swayEnvelope = 1 - Math.pow(t, roadConfig.curve.envelopeExponent);
      const sway = swayAmp * swayEnvelope * Math.sin(((1 - t) * swayFreq * Math.PI) + swayPhase);
      return baseCenterX + sway;
    };

    const steps = roadConfig.pathSampling.pathSteps;
    const left = [];
    const right = [];
    const center = [];

    for (let index = 0; index <= steps; index += 1) {
      const t = index / steps;
      const y = yTop + (t * ySpan);
      const widthAtY = widthAt(t);
      const centerX = centerAt(t);

      const half = widthAtY * 0.5;
      const leftX = clamp(centerX - half, edgeInset, viewW - edgeInset);
      const rightX = clamp(centerX + half, edgeInset, viewW - edgeInset);

      left.push({ x: leftX, y });
      right.push({ x: rightX, y });
      center.push({ x: centerX, y });
    }

    const leftSegment = left.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
    const rightSegment = right.slice().reverse().map((point) => `L${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
    goldRoadShape.setAttribute('d', `${leftSegment} ${rightSegment} Z`);

    const centerSegment = center.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
    goldRoadCenterline.setAttribute('d', centerSegment);

    const seamPaths = [];
    let yCursor = yTop + roadConfig.seams.rowStartOffsetY;
    let rowIndex = 0;

    while (yCursor < (yBottom - 4)) {
      const t = clamp((yCursor - yTop) / ySpan, 0, 1);
      const rowHeight = roadConfig.seams.rowHeightMin + (roadConfig.seams.rowHeightRange * Math.pow(t, roadConfig.seams.rowHeightExponent));
      const yNext = Math.min(yBottom, yCursor + rowHeight);

      const widthAtY = widthAt(t);
      if (widthAtY >= roadConfig.seams.minRoadWidthForSeams) {
        const centerX = centerAt(t);
        const inset = Math.max(roadConfig.seams.sideInsetMin, widthAtY * roadConfig.seams.sideInsetRatio);
        const x1 = centerX - (widthAtY * 0.5) + inset;
        const x2 = centerX + (widthAtY * 0.5) - inset;
        const hStroke = roadConfig.seams.horizontalStrokeMin + (roadConfig.seams.horizontalStrokeRange * t);

        seamPaths.push(`<path class="road-seam" d="M ${x1.toFixed(2)} ${yCursor.toFixed(2)} L ${x2.toFixed(2)} ${yCursor.toFixed(2)}" stroke-width="${hStroke.toFixed(2)}"></path>`);

        const yMid = (yCursor + yNext) * 0.5;
        const tMid = clamp((yMid - yTop) / ySpan, 0, 1);
        const rowWidth = widthAt(tMid);
        const rowCenter = centerAt(tMid);
        const rowInset = Math.max(roadConfig.seams.sideInsetMin, rowWidth * roadConfig.seams.sideInsetRatio);
        const rowLeft = rowCenter - (rowWidth * 0.5) + rowInset;
        const rowRight = rowCenter + (rowWidth * 0.5) - rowInset;

        const brickW = roadConfig.seams.brickWidthMin + (roadConfig.seams.brickWidthRange * Math.pow(tMid, roadConfig.seams.brickWidthExponent));
        const vStroke = roadConfig.seams.verticalStrokeMin + (roadConfig.seams.verticalStrokeRange * tMid);
        const stagger = rowIndex % 2 === 0 ? 0 : brickW * 0.5;

        for (let x = rowLeft + stagger; x < rowRight; x += brickW) {
          seamPaths.push(`<path class="road-seam" d="M ${x.toFixed(2)} ${(yCursor + roadConfig.seams.verticalInsetY).toFixed(2)} L ${x.toFixed(2)} ${(yNext - roadConfig.seams.verticalInsetY).toFixed(2)}" stroke-width="${vStroke.toFixed(2)}"></path>`);
        }
      }

      yCursor = yNext;
      rowIndex += 1;
    }

    goldRoadSeams.innerHTML = seamPaths.join('');
  };

  const scheduleRoadRender = () => {
    if (renderRaf) {
      return;
    }

    renderRaf = window.requestAnimationFrame(() => {
      renderRaf = 0;
      buildRoadFromMath();
    });
  };

  const onResize = () => scheduleRoadRender();
  window.addEventListener('resize', onResize);

  applyRoadFeatureFlag();

  return {
    renderRoad: buildRoadFromMath,
    scheduleRender: scheduleRoadRender,
    destroy: () => {
      if (renderRaf) {
        window.cancelAnimationFrame(renderRaf);
        renderRaf = 0;
      }
      window.removeEventListener('resize', onResize);
    },
  };
}
