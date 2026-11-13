import * as ort from 'onnxruntime-web';
import { useEffect, useRef, useState } from 'react';
import Tesseract from 'tesseract.js';
import { batchEmbed, matchNames } from '../utils/embeddingFunction';
import { loadImage, parseClashV2Info } from '../utils/function';
import { OCR_CANVAS_SCALE } from '../utils/ocrConfig';
import { recognize } from '../utils/ocrWorker';
import { sliceDeepClashBossCells, sliceDeepClashPersCells } from '../utils/sliceCells';


const ProcessDeepClashComponent = ({ session, debugInfo, setDebugInfo }) => {
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [results, setResults] = useState([]);   // 이제 각 요소가 { grade, score, duration, timeBonus, arr } 형태
    const [storedEmbs, setStoredEmbs] = useState([]);  // { name: string, emb: Float32Array }[]
    const canvasRef = useRef(document.createElement('canvas'));
    const [fileList, setFileList] = useState([]);
    const [resultDebug, setResultDebug] = useState({});

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

        const regions = kind === 'boss' ? [
            { name: 'region2', x: 72, y: 157, w: 191, h: 22, color: 'yellow', whitelist: '0123456789,' }, // 보스 점수
        ] : [
            { name: 'depth', x: 132, y: 76, w: 60, h: 24, color: 'white', whitelist: '0123456789' }, // 성격 해역 수심
            { name: 'region3', x: 175, y: 116, w: 64, h: 19, color: 'yellow', whitelist: '0123456789:' }, // 성격 클리어 시간
        ];
        const ocr = {};

        for (const { name, x, y, w, h, color, whitelist } of regions) {

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
            let off = document.createElement('canvas');
            off.width = w * OCR_CANVAS_SCALE + PAD * 2;
            off.height = h * OCR_CANVAS_SCALE + PAD * 2;
            const ctx = off.getContext('2d', { willReadFrequently: true });
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, off.width, off.height);
            ctx.drawImage(small, 0, 0, w, h, PAD, PAD, w * OCR_CANVAS_SCALE, h * OCR_CANVAS_SCALE);


            const { data: { text } } = await recognize(off, 'eng', {
                tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
                tessedit_char_whitelist: whitelist
            });

            ocr[name] = text.trim();
        }

        for (const [key, value] of Object.entries(ocr)) {
            console.log(`ocr: ${key}: ${value}`);
        }

        console.log('→ OCR 완료:', ocr);
        console.timeEnd(`OCR ${idx}`);

        // 파서 같이쓰기
        const info = parseClashV2Info({ region1: '', region2: ocr.region2 ?? '', region3: ocr.region3 ?? '', region4: '' });
        return { score: info.score, duration: info.duration, depth: ocr.depth ? parseInt(ocr.depth, 10) : null };
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
                matchNames(embs, cells, storedEmbs, idx)
            ]);
            return { gameInfo, names };
        } finally {
            URL.revokeObjectURL(url);
        }
    };

    const handleFiles = async e => {
        if (!session) return;
        const files = Array.from(e.target.files);

        // 폴더명 = 이미지 종류(boss, naive, gloomy ...), 파일명 숫자 = 순위 → 순위별로 6장을 묶는다
        const groups = {};
        files.forEach(file => {
            const parts = file.webkitRelativePath.split('/');
            const kind = parts[parts.length - 2];
            const rank = parseInt(file.name.match(/\d+/)?.[0], 10);
            if (!isNaN(rank)) (groups[rank] ||= {})[kind] = file;
        });
        const bundles = Object.keys(groups).map(Number).sort((a, b) => a - b)
            .map(rank => ({ rank, files: groups[rank] }));

        setResults([]);
        setFileList(bundles);
        setProgress({ current: 0, total: bundles.length });

        for (let idx = 0; idx < bundles.length; idx++) {
            const { rank, files: bundle } = bundles[idx];
            console.log(`🔄 [${idx + 1}/${bundles.length}] ${rank}위 처리 시작`);

            try {
                const resultObject = { rank, score: null, arr: [], skinArr: [], personalities: {} };

                for (const [kind, file] of Object.entries(bundle)) {
                    setDebugInfo(`${rank}위 ${kind} 처리 중... (${idx + 1}/${bundles.length})`);
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

                if (results.length > 0 && resultObject.rank !== null) {
                    // 바로 이전 결과와만 비교
                    const prevResult = results[resultObject?.rank - 1];
                    if (prevResult?.rank !== null && prevResult?.score < resultObject?.score && prevResult?.rank < resultObject?.rank) {
                        const debugKey = prevResult?.rank;
                        const debugMessage = `${prevResult?.rank}위 점수: ${prevResult?.score} < ${resultObject?.rank}위 점수: ${resultObject?.score}`;

                        setResultDebug(prev => ({
                            ...prev,
                            [debugKey]: debugMessage
                        }));

                        console.warn(`🚨 랭킹 버그 감지:`, debugMessage);
                    }
                }
                if (resultObject.score === null || isNaN(resultObject.score)) {
                    const debugMessage = `${resultObject.rank}위 null 발생: score: ${resultObject.score}`;
                    setResultDebug(prev => ({
                        ...prev,
                        [resultObject.rank]: debugMessage
                    }));
                    console.warn(`🚨 랭킹 버그 감지:`, debugMessage);
                }

                // if (resultObject.duration < 120) {
                //     const debugMessage = `${resultObject.rank}위 플레이 타임: ${resultObject.duration}`
                //     setResultDebug(prev => ({
                //         ...prev,
                //         [resultObject.rank]: debugMessage
                //     }));
                //     console.warn(`🚨 랭킹 버그 감지:`, debugMessage);
                // }

                // 6) 결과 누적 & 진행도 업데이트
                setResults(prev => [...prev, resultObject]);
                setProgress(p => ({ current: p.current + 1, total: p.total }));

            } catch (error) {
                console.error(`파일 ${idx + 1} 처리 중 오류:`, error);
                // 오류 발생 시에도 기본 객체 추가
                setResults(prev => [...prev, {
                    rank,
                    score: 0,
                    arr: [],
                    skinArr: [],
                    personalities: {}
                }]);
                setProgress(p => ({ current: p.current + 1, total: p.total }));
            }
        } // 파일 수만큼 반복 완료

        if (Object.keys(resultDebug).length === 0) {
            console.log("✅ 특이사항이 없습니다. ", resultDebug)
        } else {
            console.log("❗ 특이사항 발생: ", resultDebug)
        }

        setDebugInfo('모든 파일 처리 완료!');
    };

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
                    disabled={!session}
                    className="w-full p-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <p className="text-sm text-gray-500 mt-2">
                    폴더명이 이미지 종류, 파일명의 숫자가 순위입니다. 순위별로 보스 1장 + 성격 5장을 묶어 분석합니다.
                </p>
            </div>

            {/* 개별 결과 확인 */}
            <div className="mb-8">
                <h3 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                    📊 개별 분석 결과
                    <span className="ml-3 text-sm font-normal text-gray-500">({results.length}개 완료)</span>
                </h3>

                <div className="grid gap-4">
                    {fileList.map((bundle, i) => (
                        <div key={bundle.rank} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex justify-between items-center mb-3">
                                <h4 className="font-semibold text-gray-800 truncate mr-4">
                                    {bundle.rank}위 ({Object.keys(bundle.files).length}/6장)
                                </h4>
                                {results[i] && (
                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                        ✅ 분석 완료
                                    </span>
                                )}
                            </div>

                            <div className="flex flex-col gap-4">
                                {Object.entries(bundle.files).map(([kind, file]) => {
                                    const part = kind === 'boss' ? results[i] : results[i]?.personalities?.[kind];
                                    return (
                                        <div key={kind}>
                                            <div className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">{kind}</div>
                                            <img
                                                src={URL?.createObjectURL(file)}
                                                alt={file.name}
                                                className="w-full object-cover rounded-lg border border-gray-200"
                                            />
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
                                navigator.clipboard.writeText(JSON.stringify(results, null, 2));
                                // 복사 완료 피드백을 위한 간단한 알림 (선택사항)
                            }}
                            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                            <span>📋</span>
                            <span>복사</span>
                        </button>
                    </div>
                    <pre className="p-4 text-xs font-mono text-gray-700 max-h-80 overflow-auto leading-relaxed">
                        {JSON.stringify(results.sort((a, b) => a.rank - b.rank), null, 2)}
                    </pre>
                </div>
            </div>

            <canvas ref={canvasRef} className="hidden" />
        </div>
    );
}

export default ProcessDeepClashComponent;