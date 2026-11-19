import * as ort from 'onnxruntime-web';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import Tesseract from 'tesseract.js';
import { batchEmbed, matchNames } from '../utils/embeddingFunction';
import { loadImage, parseClashV2Info } from '../utils/function';
import { OCR_CANVAS_SCALE } from '../utils/ocrConfig';
import { recognize } from '../utils/ocrWorker';
import { sliceDeepClashBossCells, sliceDeepClashPersCells } from '../utils/sliceCells';

const STORAGE_KEY = 'deepClashResults:v2'; // 1부터 시작하는 순위를 브라우저에 자동 저장
const LEGACY_STORAGE_KEY = 'deepClashResults:v1';

// 저장된 결과 불러오기
function loadSaved() {
    try {
        const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (Array.isArray(current)) return current;

        // v1은 0부터 시작하는 파일 번호를 순위로 저장했으므로 1을 더해 옮긴다.
        const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || '[]');
        if (!Array.isArray(legacy)) return [];
        const migrated = legacy.map(result => ({ ...result, rank: result.rank + 1 }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
    } catch {
        return [];
    }
}

function saveResults(list) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
        console.warn('자동 저장 실패(용량 초과 등). JSON 다운로드로 백업하세요:', e);
    }
}

// rank 기준으로 추가/교체한 새 배열
const upsert = (list, item) => [...list.filter(r => r.rank !== item.rank), item].sort((a, b) => a.rank - b.rank);

// 순위 1명의 이미지와 분석 결과 카드.
// memo 로 감싸서 새 순위가 추가될 때 기존 카드는 다시 그려지지 않는다. (이미지가 화면 밖이면 loading="lazy" 로 불러오지 않는다)
const RankCard = memo(function RankCard({ result, bundle, urlFor }) {
    const [showImages, setShowImages] = useState(false);
    const kinds = ['boss', ...Object.keys(result.personalities ?? {})];
    return (
        <div id={`rank-${result.rank}`} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-center mb-3">
                <h4 className="font-semibold text-gray-800 truncate mr-4">
                    {result.rank}위 ({kinds.length}/6장)
                    {!bundle && <span className="ml-2 text-xs font-normal text-gray-400">(이미지는 폴더를 선택하면 표시됩니다)</span>}
                </h4>
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    ✅ 분석 완료
                </span>
            </div>

            <div className="flex flex-col gap-4">
                <button
                    type="button"
                    onClick={() => setShowImages(value => !value)}
                    className="self-start text-sm text-blue-700 hover:underline"
                >
                    {showImages ? '원본 이미지 숨기기' : '원본 이미지 보기'}
                </button>
                {kinds.map(kind => {
                    const part = kind === 'boss' ? result : result.personalities?.[kind];
                    const file = bundle?.files[kind];
                    return (
                        <div key={kind}>
                            <div className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">{kind}</div>
                            {file && showImages && (
                                <img
                                    src={urlFor(file)}
                                    alt={file.name}
                                    width={900}
                                    height={206}
                                    loading="lazy"
                                    decoding="async"
                                    className="w-full h-auto object-cover rounded-lg border border-gray-200"
                                />
                            )}
                            {part && (
                                <div className='flex'>
                                    <div className="w-[330px] bg-gray-50 rounded-lg p-4">
                                        <div className="flex-col flex  items-center justify-center w-[300px]">
                                            {kind === 'boss' ? (
                                                <div className="bg-white rounded-lg p-3 border border-gray-200 w-full">
                                                    <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">점수</div>
                                                    <div className="text-lg font-bold text-green-600">{part.score?.toLocaleString()}</div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="bg-white rounded-lg p-3 border border-gray-200 w-full">
                                                        <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">수심</div>
                                                        <div className="text-lg font-bold text-blue-600">{part.depth}m</div>
                                                    </div>
                                                    <div className="bg-white rounded-lg p-3 border border-gray-200 w-full">
                                                        <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">시간</div>
                                                        <div className="text-lg font-bold text-purple-600">{part.duration}초</div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="bg-white rounded-lg p-3 border gap-y-2 flex flex-col border-gray-200 w-[480px]">
                                        <div className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">사도 배열</div>
                                        <div className="text-[14px] bg-gray-100 p-2 rounded border font-mono overflow-x-auto flex justify-end pr-24">
                                            {part.arr.join(', ')}
                                        </div>
                                        <div className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">사복 배열</div>
                                        <div className="text-[14px] bg-gray-100 p-2 rounded border font-mono overflow-x-auto flex justify-end pr-24">
                                            {part.skinArr.join(', ')}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
});

const ProcessDeepClashComponent = ({ session, debugInfo, setDebugInfo }) => {
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [results, setResults] = useState(loadSaved);   // 저장된 결과가 있으면 불러온다
    const [storedEmbs, setStoredEmbs] = useState([]);  // { name: string, emb: Float32Array }[]
    const canvasRef = useRef(document.createElement('canvas'));
    const [failed, setFailed] = useState([]);       // 처리에 실패한 순위
    const [running, setRunning] = useState(false);
    const [resume, setResume] = useState(true);       // 저장된 결과가 있으면 끝난 순위는 건너뛴다
    const resultsRef = useRef(results);   // 처리 루프 안에서 최신 결과를 읽기 위한 ref (state 는 루프가 시작된 시점의 값에 묶인다)
    const bundleMapRef = useRef({});      // rank -> { rank, files }  File 참조만 들고 있어서 가볍다
    const stopRef = useRef(false);
    const urlCacheRef = useRef(new Map());   // File -> 이미지 URL. 렌더링마다 새로 만들면 메모리가 쌓이므로 파일당 한 번만 만든다

    const urlFor = useCallback(file => {
        const cache = urlCacheRef.current;
        if (!cache.has(file)) cache.set(file, URL.createObjectURL(file));
        return cache.get(file);
    }, []);

    useEffect(() => {
        fetch('/data/embeddings.json')
            .then(res => {
                if (!res.ok) throw new Error('embeddings.json 로드 실패');
                return res.json();
            })
            .then(data => {
                // 임베딩 데이터를 Float32Array로 변환하여 저장
                const list = Object.entries(data).map(([name, obj]) => {
                    const arr = Object.keys(obj)
                        .sort((a, b) => Number(a) - Number(b))
                        .map(k => Number(obj[k]));
                    return {
                        name,
                        emb: Float32Array.from(arr)
                    };
                });
                setStoredEmbs(list);
                console.log('loaded', list.length, 'embeddings, each dim=', list[0].emb.length);
            })
            .catch(console.error);
    }, []);

    // 심해 대격돌용 OCR
    async function performOCR(img, idx, kind) {
        console.time(`OCR ${idx}`);

        async function recognizeRegion({ x, y, w, h, color, whitelist }) {
            // 글자색만 남겨 검정 글씨/흰 배경으로 만든 뒤 확대
            const small = document.createElement('canvas');
            small.width = w;
            small.height = h;
            const sctx = small.getContext('2d', { willReadFrequently: true });
            sctx.drawImage(img, x, y, w, h, 0, 0, w, h);
            const imageData = sctx.getImageData(0, 0, w, h);
            const px = imageData.data;
            for (let i = 0; i < px.length; i += 4) {
                const hit = color === 'white'
                    ? (px[i] > 215 && px[i + 1] > 215 && px[i + 2] > 215)
                    : (px[i] > 200 && px[i + 1] > 180 && px[i + 2] < 140);
                px[i] = px[i + 1] = px[i + 2] = hit ? 0 : 255;
                px[i + 3] = 255;
            }
            sctx.putImageData(imageData, 0, 0);

            const PAD = 20; // 글자가 가장자리에 닿으면 오인식되므로 흰 여백을 준다
            const off = document.createElement('canvas');
            off.width = w * OCR_CANVAS_SCALE + PAD * 2;
            off.height = h * OCR_CANVAS_SCALE + PAD * 2;
            const ctx = off.getContext('2d', { willReadFrequently: true });
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, off.width, off.height);
            ctx.drawImage(small, 0, 0, w, h, PAD, PAD, w * OCR_CANVAS_SCALE, h * OCR_CANVAS_SCALE);

            const { data: { text } } = await recognize(off, 'eng', null, {
                tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
                tessedit_char_whitelist: whitelist
            });
            return text.trim();
        }

        const regions = kind === 'boss' ? [
            { name: 'region2', x: 72, y: 157, w: 191, h: 22, color: 'yellow', whitelist: '0123456789,' }, // 보스 점수
        ] : [
            { name: 'depth', x: 132, y: 76, w: 80, h: 24, color: 'white', whitelist: '0123456789m' }, // 숫자와 단위 m 전체를 인식해 단위 일부가 1로 붙는 것을 방지
            { name: 'region3', x: 175, y: 116, w: 64, h: 19, color: 'yellow', whitelist: '0123456789:' }, // 성격 클리어 시간
        ];
        const ocr = {};

        for (const { name, ...region } of regions) ocr[name] = await recognizeRegion(region);

        console.timeEnd(`OCR ${idx}`);

        // 파서 같이쓰기
        let info = parseClashV2Info({ region1: '', region2: ocr.region2 ?? '', region3: ocr.region3 ?? '', region4: '' });
        // 기존 좁은 crop이 시간 앞자리를 놓쳐 null/비현실적인 값이 될 때만 넓은 crop으로 재시도한다.
        if (kind !== 'boss' && (info.duration === null || info.duration > 120)) {
            const fallbackTime = await recognizeRegion({
                x: 150, y: 116, w: 100, h: 19, color: 'yellow', whitelist: '0123456789:'
            });
            const retryInfo = parseClashV2Info({ region1: '', region2: '', region3: fallbackTime, region4: '' });
            if (retryInfo.duration !== null && retryInfo.duration <= 120) info = retryInfo;
            else if (info.duration > 120) info = { ...info, duration: null };
        }
        const depthMatch = /^\s*(\d{1,3})\s*m?\s*$/i.exec(ocr.depth ?? '');
        const depth = depthMatch ? Number.parseInt(depthMatch[1], 10) : null;
        return { score: info.score, duration: info.duration, depth: depth !== null && depth <= 300 ? depth : null };
    }

    // 이미지 1장 분석
    const analyzeFile = async (file, kind, idx) => {
        const url = URL.createObjectURL(file);
        try {
            // 셀 분할
            console.time(`slice ${idx}`);
            const img = await loadImage(url);
            const canvas = canvasRef.current;
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0);
            const rects = kind === 'boss'
                ? sliceDeepClashBossCells()
                : sliceDeepClashPersCells();
            const cells = rects.map((rect, i) => {
                const off = document.createElement('canvas');
                off.width = rect.w;
                off.height = rect.h;
                const offCtx = off.getContext('2d', { willReadFrequently: true });
                offCtx.drawImage(canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
                return { ...rect, index: i, url: off.toDataURL() };
            });
            console.timeEnd(`slice ${idx}`);

            // 배치 임베딩
            console.time(`Embed ${idx}`);
            const urls = cells.map(c => c.url);
            const embs = await batchEmbed(urls, canvasRef, ort, session);
            cells.forEach((c, i) => c.emb = embs[i]);
            console.timeEnd(`Embed ${idx}`);

            // 게임 정보 추출 + 매칭 & 예측 이름 추출
            const [gameInfo, names] = await Promise.all([
                performOCR(img, idx, kind),
                matchNames(embs, cells, storedEmbs, idx, { quiet: true })
            ]);
            return { gameInfo, names };
        } finally {
            URL.revokeObjectURL(url);
        }
    };

    const handleFiles = async e => {
        if (!session) return;
        const files = Array.from(e.target.files);

        // 폴더명 = 이미지 종류(boss, innocence, depressed ...), 파일명 숫자 = 순위 → 순위별로 6장을 묶는다
        const groups = {};
        files.forEach(file => {
            const parts = file.webkitRelativePath.split('/');
            const kind = parts[parts.length - 2];
            const fileNumber = parseInt(file.name.match(/\d+/)?.[0], 10);
            const rank = fileNumber + 1;
            if (!isNaN(rank)) (groups[rank] ||= {})[kind] = file;
        });
        const bundles = Object.keys(groups).map(Number).sort((a, b) => a - b)
            .map(rank => ({ rank, files: groups[rank] }));
        bundleMapRef.current = Object.fromEntries(bundles.map(b => [b.rank, b]));
        urlCacheRef.current.forEach(url => URL.revokeObjectURL(url)); // 이전 폴더의 이미지 URL 해제
        urlCacheRef.current.clear();

        // 이어하기: 이미 끝난 순위는 건너뛴다
        if (!resume && resultsRef.current.length > 0) {
            if (!window.confirm(`저장된 결과 ${resultsRef.current.length}개를 지우고 처음부터 시작할까요?`)) return;
            resultsRef.current = [];
            setResults([]);
            saveResults([]);
        }
        const doneRanks = new Set(resultsRef.current.map(r => r.rank));
        const todo = bundles.filter(b => !doneRanks.has(b.rank));

        setFailed([]);
        setRunning(true);
        stopRef.current = false;
        setProgress({ current: 0, total: todo.length });
        setDebugInfo(todo.length < bundles.length ? `이어하기: 완료된 ${bundles.length - todo.length}개 순위는 건너뜀` : '처리 시작');
        const debug = {}; // 특이사항 모음

        for (let idx = 0; idx < todo.length; idx++) {
            if (stopRef.current) break;
            const { rank, files: bundle } = todo[idx];
            console.log(`🔄 [${idx + 1}/${todo.length}] ${rank}위 처리 시작`);

            try {
                const resultObject = { rank, score: null, arr: [], skinArr: [], personalities: {} };

                for (const [kind, file] of Object.entries(bundle)) {
                    setDebugInfo(`${rank}위 ${kind} 처리 중... (${idx + 1}/${todo.length})`);
                    const { gameInfo, names } = await analyzeFile(file, kind, idx);

                    const arr = names.filter(Boolean).map(n => n.charName);
                    const skinArr = names.filter(Boolean).map(n => n.skinName);

                    if (kind === 'boss') {
                        resultObject.score = gameInfo.score;
                        resultObject.arr = arr;
                        resultObject.skinArr = skinArr;
                    } else {
                        resultObject.personalities[kind] = { depth: gameInfo.depth, duration: gameInfo.duration, arr, skinArr };
                    }
                }

                // 바로 앞 순위 점수와 비교 (state 가 아니라 ref 의 최신 결과를 읽는다)
                const prevResult = resultsRef.current.find(r => r.rank === rank - 1);
                if (prevResult && prevResult.score < resultObject.score) {
                    debug[prevResult.rank] = `${prevResult.rank}위 점수: ${prevResult.score} < ${rank}위 점수: ${resultObject.score}`;
                    console.warn(`🚨 랭킹 버그 감지:`, debug[prevResult.rank]);
                }
                if (resultObject.score === null || isNaN(resultObject.score)) {
                    debug[rank] = `${rank}위 null 발생: score: ${resultObject.score}`;
                    console.warn(`🚨 랭킹 버그 감지:`, debug[rank]);
                }

                // 결과 누적 + 자동 저장 + 미리보기 순위 갱신
                resultsRef.current = upsert(resultsRef.current, resultObject);
                setResults(resultsRef.current);
                saveResults(resultsRef.current);

            } catch (error) {
                console.error(`${rank}위 처리 중 오류:`, error);
                debug[rank] = `${rank}위 처리 실패: ${error?.message || error}`;
                setFailed(prev => [...prev, rank]); // 저장하지 않으므로 다음 이어하기에서 다시 시도된다
            }
            setProgress(p => ({ current: p.current + 1, total: p.total }));
        } // 순위 수만큼 반복 완료

        setRunning(false);
        if (Object.keys(debug).length === 0) {
            console.log("✅ 특이사항이 없습니다. ", debug);
        } else {
            console.log("❗ 특이사항 발생: ", debug);
        }
        setDebugInfo(stopRef.current ? '중지됨 (같은 폴더를 다시 선택하면 이어서 진행합니다)' : '모든 파일 처리 완료!');
    };

    // 현재 결과를 .json 파일로 저장
    const downloadJson = () => {
        const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `deep_clash_${results.length}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    // 이전에 저장한 .json 을 불러와 합친다 (이미 있는 순위는 유지)
    const importJson = async e => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
            const list = JSON.parse(await file.text());
            if (!Array.isArray(list) || !list.every(r => Number.isInteger(r?.rank))) throw new Error('rank 가 있는 객체 배열이 아닙니다');
            let merged = resultsRef.current;
            let added = 0;
            for (const r of list) {
                if (!merged.some(x => x.rank === r.rank)) { merged = upsert(merged, r); added++; }
            }
            resultsRef.current = merged;
            setResults(merged);
            saveResults(merged);
            setDebugInfo(`JSON 불러오기: ${list.length}개 중 ${added}개 추가 (이미 있는 순위는 유지)`);
        } catch (err) {
            setDebugInfo('JSON 불러오기 실패: ' + err.message);
        }
    };

    const clearSaved = () => {
        if (!window.confirm(`저장된 결과 ${results.length}개를 모두 지웁니다. 계속할까요?`)) return;
        resultsRef.current = [];
        setResults([]);
        saveResults([]);
    };

    // 컴포넌트가 사라질 때 이미지 URL 을 모두 해제한다
    useEffect(() => {
        const cache = urlCacheRef.current;
        return () => {
            cache.forEach(url => URL.revokeObjectURL(url));
            cache.clear();
        };
    }, []);

    return (
        <div className="p-6 max-w-4xl mx-auto bg-white min-h-screen">
            <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-gray-800 mb-2 bg-gradient-to-r from-sky-800">🌊 심해 대격돌 이미지 분석 도구</h2>
                <p className="text-gray-600">폴더(보스 + 성격별)를 올리면 순위별 6장을 묶어 분석합니다</p>
            </div>

            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 mb-6 border border-blue-200">
                <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-4">
                        <div className="flex items-center">
                            <span className="text-sm font-medium text-gray-700 mr-2">진행:</span>
                            <span className="text-lg font-bold text-blue-600">{progress.current}/{progress.total}</span>
                        </div>
                        <div className="w-px h-6 bg-gray-300"></div>
                        <div className="flex items-center">
                            <span className="text-sm font-medium text-gray-700 mr-2">상태:</span>
                            <span className="text-sm text-green-600 font-medium">{debugInfo}</span>
                        </div>
                    </div>
                    {progress.total > 0 && (
                        <div className="w-32 bg-gray-200 rounded-full h-2">
                            <div
                                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${(progress.current / progress.total) * 100}%` }}
                            ></div>
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6 shadow-sm">
                <label className="block text-lg font-semibold text-gray-800 mb-3">
                    🎨 deep_clash 폴더 선택 (boss, 성격별 폴더가 들어 있는 상위 폴더)
                </label>
                <input
                    type="file"
                    multiple
                    webkitdirectory=""
                    accept="image/*"
                    onChange={handleFiles}
                    disabled={!session || running}
                    className="w-full p-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <p className="text-sm text-gray-500 mt-2">
                    폴더명이 이미지 종류, 파일명의 숫자가 순위입니다. 순위별로 보스 1장 + 성격 5장을 묶어 분석합니다.
                </p>

                <div className="flex flex-wrap items-center gap-3 mt-4 text-sm">
                    <label className="flex items-center gap-1">
                        <input type="checkbox" checked={resume} onChange={e => setResume(e.target.checked)} disabled={running} />
                        이어하기 (저장된 순위는 건너뜀)
                    </label>
                    <button onClick={() => { stopRef.current = true; }} disabled={!running}
                        className="px-3 py-1 bg-gray-600 text-white rounded-lg disabled:opacity-40">중지</button>
                    <button onClick={downloadJson} disabled={!results.length}
                        className="px-3 py-1 bg-indigo-600 text-white rounded-lg disabled:opacity-40">⬇ JSON 다운로드</button>
                    <label className="px-3 py-1 bg-white border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                        📂 JSON 불러오기
                        <input type="file" accept=".json,application/json" onChange={importJson} disabled={running} className="hidden" />
                    </label>
                    <button onClick={clearSaved} disabled={running || !results.length}
                        className="px-3 py-1 bg-red-50 text-red-700 border border-red-200 rounded-lg disabled:opacity-40">저장된 결과 지우기</button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                    끝난 순위는 브라우저에 자동 저장됩니다. 탭이 종료되어도 같은 폴더를 다시 선택하면 이어서 진행합니다. (저장된 결과 {results.length}개{failed.length ? `, 실패: ${failed.join(', ')}위` : ''})
                </p>
            </div>

            {/* 개별 결과 확인 */}
            <div className="mb-8">
                <h3 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                    📊 개별 분석 결과
                    <span className="ml-3 text-sm font-normal text-gray-500">({results.length}개 완료)</span>
                </h3>

                <div className="max-h-72 overflow-auto border border-gray-200 rounded-lg">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                            <tr>
                                <th className="p-2 text-left">순위</th>
                                <th className="p-2 text-right">점수</th>
                                <th className="p-2 text-left">성격별 (수심 / 시간)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {results.map(r => (
                                <tr key={r.rank}
                                    onClick={() => document.getElementById(`rank-${r.rank}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                                    className="border-t border-gray-100 cursor-pointer hover:bg-blue-50">
                                    <td className="p-2 font-bold">{r.rank}위</td>
                                    <td className="p-2 text-right font-mono">{r.score?.toLocaleString() ?? '-'}</td>
                                    <td className="p-2 text-xs text-gray-600">
                                        {Object.entries(r.personalities ?? {}).map(([k, v]) => `${k} ${v.depth ?? '-'}m/${v.duration ?? '-'}초`).join(' · ')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="grid gap-4 mt-4">
                    {results.map(r => (
                        <RankCard key={r.rank} result={r} bundle={bundleMapRef.current[r.rank]} urlFor={urlFor} />
                    ))}
                </div>
            </div>

            {/* 최종 복사용 결과 */}
            <div className="mb-8">
                <h3 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                    📋 최종 결과 배열 (복사용)
                    <span className="ml-3 text-sm font-normal text-gray-500">다른 사이트에서 활용</span>
                </h3>

                <div className="bg-gray-50 rounded-xl border border-gray-200 relative overflow-hidden">
                    <div className="flex justify-between items-center p-4 bg-gradient-to-r from-gray-100 to-gray-50 border-b border-gray-200">
                        <div className="flex items-center space-x-2">
                            <span className="text-sm font-medium text-gray-700">JSON 형식</span>
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full font-medium">
                                {results.length}개 객체
                            </span>
                        </div>
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(JSON.stringify(results, null, 2)); // 누를 때만 문자열로 만든다
                                // 복사 완료 피드백을 위한 간단한 알림 (선택사항)
                            }}
                            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                            <span>📋</span>
                            <span>복사</span>
                        </button>
                    </div>
                    <p className="px-4 pt-3 text-xs text-gray-500">마지막 1명 미리보기 (전체는 위 복사 버튼이나 JSON 다운로드로 받으세요)</p>
                    <pre className="p-4 text-xs font-mono text-gray-700 max-h-80 overflow-auto leading-relaxed">
                        {JSON.stringify(results.slice(-1), null, 2)}
                    </pre>
                </div>
            </div>

            <canvas ref={canvasRef} className="hidden" />
        </div>
    );
}

export default ProcessDeepClashComponent;
