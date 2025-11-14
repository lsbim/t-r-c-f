import * as ort from 'onnxruntime-web';
import { useEffect, useRef, useState } from 'react';
import Tesseract from 'tesseract.js';
import { getAverageColor, getClosestAttribute } from '../utils/colorCompareFunction';
import { batchEmbed } from '../utils/embeddingFunction';
import { loadImage, parseClashV2Info } from '../utils/function';
import { applyPreprocessing, invertColors } from '../utils/ocrFunction';
import { sliceClashV2Cells } from '../utils/sliceCells';

const THRESH = 0.8;

const ProcessClashV2Component = ({ session, debugInfo, setDebugInfo }) => {
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

    // OCR 수행 함수 - InfoComponent에서 가져온 로직
    async function performOCR(imageUrl) {
        const regions = [
            { name: 'region1', x: 17, y: 3, w: 105, h: 27 }, // 2.0 전용 단계
            { name: 'region2', x: 56, y: 214, w: 160, h: 19 }, // 2.0 전용 점수
            { name: 'region3', x: 101, y: 238, w: 52, h: 16 }, // 2.0 전용 플레이 시간
            { name: 'region4', x: 86, y: 261, w: 49, h: 18 }, // 2.0 전용 이면세계 단계
        ];
        const img = await loadImage(imageUrl);
        const ocr = {};

        for (const { name, x, y, w, h } of regions) {
            let off = document.createElement('canvas');
            off.width = w; off.height = h;
            off.getContext('2d', { willReadFrequently: true }).drawImage(img, x, y, w, h, 0, 0, w, h);

            const opts = name === 'region1' ? {
                tessedit_ocr_engine_mode: 1,
                tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
                tessedit_char_whitelist: '0123456789단계'
            } : {
                tessedit_ocr_engine_mode: 1,
                tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
                tessedit_char_whitelist: '0123456789:,'
            };

            const { data: { text } } = await Tesseract.recognize(off, 'kor+eng', opts);
            ocr[name] = text.trim();
        }

        console.log(`ocr: ${ocr}`)

        return parseClashV2Info(ocr);
    }


    const handleFiles = async e => {
        if (!session) return;
        const files = Array.from(e.target.files);
        setResults([]);
        setFileList(files);
        setProgress({ current: 0, total: files.length });

        for (let idx = 0; idx < files.length; idx++) {
            const file = files[idx];
            console.log(`🔄 [${idx + 1}/${files.length}] ${file.name} 처리 시작`);

            const url = URL.createObjectURL(file);

            try {
                // 1) OCR로 게임 정보 추출
                console.time(`OCR ${idx}`);
                setDebugInfo(`파일 ${idx + 1}/${files.length} OCR 중...`);
                const gameInfo = await performOCR(url);
                console.log('→ OCR 완료:', gameInfo);
                console.timeEnd(`OCR ${idx}`);

                // 2) 셀 분할
                console.time(`slice ${idx}`);
                setDebugInfo(`파일 ${idx + 1}/${files.length} 분할 중...`);
                const img = await loadImage(url);
                const canvas = canvasRef.current;
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(img, 0, 0);
                const rects = sliceClashV2Cells();
                const cells = rects.map((rect, i) => {
                    const off = document.createElement('canvas');
                    off.width = rect.w;
                    off.height = rect.h;
                    const offCtx = off.getContext('2d', { willReadFrequently: true });
                    offCtx.drawImage(canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
                    return { ...rect, index: i, url: off.toDataURL() };
                });
                console.log(`→ 셀 분할 완료 (${cells.length}개)`);
                console.timeEnd(`slice ${idx}`);

                // 3) 배치 임베딩
                console.time(`Embed ${idx}`);
                setDebugInfo(`파일 ${idx + 1}/${files.length} 임베딩 중...`);
                const urls = cells.map(c => c.url);
                const embs = await batchEmbed(urls, canvasRef, ort, session);
                cells.forEach((c, i) => c.emb = embs[i]);
                console.log('→ 배치 임베딩 완료');
                console.timeEnd(`Embed ${idx}`);


                console.time(`sims ${idx}`);
                const sims = embs.map(emb => {
                    let best = { score: -1, name: '' };
                    for (const { name, emb: store } of storedEmbs) {
                        const dot = store.reduce((sum, v, i) => sum + v * emb[i], 0);
                        if (dot > best.score) best = { score: dot, name };
                    }
                    return { name: best.name.split('_')[0], score: best.score };
                });
                console.timeEnd(`sims ${idx}`);

                // 4) 매칭 & 예측 이름 추출
                setDebugInfo(`파일 ${idx + 1}/${files.length} 매칭 중...`);
                console.time(`match ${idx}`);
                const names = await Promise.all(cells.map(async cell => {
                    let best = { score: -1, name: '' };
                    for (const { name, emb } of storedEmbs) {
                        let sum = 0;
                        for (let j = 0; j < emb.length; j++) sum += emb[j] * cell.emb[j];
                        if (sum > best.score) best = { score: sum, name };
                    }

                    let finalName = null;
                    if (best?.score >= THRESH) {
                        let baseName = best.name.split('_')[0]; // 예: "우로스"

                        // '우로스'인 경우에만 색상 분석 수행
                        if (baseName.startsWith('우로스')) {
                            const cellImg = await loadImage(cell.url);
                            const tempCanvas = document.createElement('canvas');
                            tempCanvas.width = cell.w;
                            tempCanvas.height = cell.h;
                            const tempCtx = tempCanvas.getContext('2d');
                            tempCtx.drawImage(cellImg, 0, 0);

                            // 색상 추출 영역
                            const roi = { x: 1, y: 15, w: 3, h: 30 };

                            const avgColor = getAverageColor(tempCanvas, roi);
                            const attribute = getClosestAttribute(avgColor);

                            if (attribute) {
                                finalName = `${baseName}(${attribute})`; // 예) "우로스(우울)"
                            } else {
                                finalName = baseName; // 색상 매칭 실패 시 기본 이름 사용
                            }
                        } else {
                            // 우로스가 아니면 기본 이름 사용
                            finalName = baseName;
                        }
                    }
                    return finalName;
                }));
                console.timeEnd(`match ${idx}`);

                const shortNames = names.filter(n => n !== null);
                console.log(`✅ [${idx + 1}] 예측(short):`, shortNames);


                // 5) 최종 결과 객체 생성 - 게임 정보와 캐릭터 배열을 합침
                const baseName = file.name.replace(/\.[^.]+$/, "");  // "0"
                const fileIdx = parseInt(baseName, 10);
                const rank = Number.isNaN(fileIdx) ? null : idx + 1;

                const resultObject = {
                    rank,
                    grade: gameInfo.grade,
                    score: gameInfo.score,
                    duration: gameInfo.duration,
                    sideGrade: gameInfo.sideGrade,
                    arr: shortNames
                };

                // 결과 로깅
                console.log(
                    `🔍 [${file.name}] 셀 유사도 → ` +
                    sims.map(({ name, score }) => {
                        if (score <= 0.935) {
                            console.warn('🚨 ' + name + '의 유사도가 0.935 보다 낮습니다: ' + score);
                            setResultDebug(prev => ({
                                ...prev,
                                [rank]: '🚨 ' + name + '의 유사도가 0.935 보다 낮습니다: ' + score
                            }));
                        }


                        return `${name} = ${score.toFixed(3)}`;
                    }).join(', ')
                );

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
                if (resultObject.score === null || resultObject.grade === null || resultObject?.grade?.length < 4) {
                    const debugMessage = `${resultObject.rank}위 null 발생: score: ${resultObject.score}, grade: ${resultObject.grade}`;
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
                if (resultObject.coin < 1000) {
                    const debugMessage = `${resultObject.rank}위 코인: ${resultObject.coin}`
                    setResultDebug(prev => ({
                        ...prev,
                        [resultObject.rank]: debugMessage
                    }));
                    console.warn(`🚨 랭킹 버그 감지:`, debugMessage);
                }

                // 6) 결과 누적 & 진행도 업데이트
                setResults(prev => [...prev, resultObject]);
                setProgress(p => ({ current: p.current + 1, total: p.total }));

            } catch (error) {
                console.error(`파일 ${idx + 1} 처리 중 오류:`, error);
                // 오류 발생 시에도 기본 객체 추가
                setResults(prev => [...prev, {
                    grade: 0,
                    score: 0,
                    duration: 0,
                    timeBonus: 0,
                    arr: []
                }]);
                setProgress(p => ({ current: p.current + 1, total: p.total }));
            } finally {
                URL.revokeObjectURL(url);
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
                <h2 className="text-3xl font-bold text-gray-800 mb-2 bg-gradient-to-r from-sky-400">🔍 차원 대충돌 2.0 이미지 분석 도구</h2>
                <p className="text-gray-600">OCR + 캐릭터 매칭을 통한 게임 스크린샷 분석</p>
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
                    🎨 분석할 게임 스크린샷 (100여장)
                </label>
                <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleFiles}
                    disabled={!session}
                    className="w-full p-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <p className="text-sm text-gray-500 mt-2">
                    각 이미지에서 게임 정보(점수, 등급 등)를 OCR로 추출하고, 캐릭터 그리드를 분석하여 매칭합니다.
                </p>
            </div>

            {/* 개별 결과 확인 */}
            <div className="mb-8">
                <h3 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                    📊 개별 분석 결과
                    <span className="ml-3 text-sm font-normal text-gray-500">({results.length}개 완료)</span>
                </h3>

                <div className="grid gap-4">
                    {fileList.map((file, i) => (
                        <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex justify-between items-center mb-3">
                                <h4 className="font-semibold text-gray-800 truncate mr-4">
                                    파일 {i + 1}: {file.name}
                                </h4>
                                {results[i] && (
                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                        ✅ 분석 완료
                                    </span>
                                )}
                            </div>

                            <div className="flex flex-col gap-4">
                                <div>
                                    <img
                                        src={URL.createObjectURL(file)}
                                        alt={file.name}
                                        className="w-full object-cover rounded-lg border border-gray-200"
                                    />
                                    {results[i] && (
                                        <div className='flex'>
                                            <div className="w-[330px] bg-gray-50 rounded-lg p-4">
                                                <div className="flex-col flex  items-center justify-center w-[300px]">
                                                    <div className="bg-white rounded-lg p-3 border border-gray-200 w-full">
                                                        <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">단계</div>
                                                        <div className="text-lg font-bold text-blue-600">{results[i].grade}</div>
                                                    </div>
                                                    <div className="bg-white rounded-lg p-3 border border-gray-200 w-full">
                                                        <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">점수</div>
                                                        <div className="text-lg font-bold text-green-600">{results[i].score?.toLocaleString()}</div>
                                                    </div>
                                                    <div className="bg-white rounded-lg p-3 border border-gray-200 w-full">
                                                        <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">시간</div>
                                                        <div className="text-lg font-bold text-purple-600">{results[i].duration}초</div>
                                                    </div>
                                                    <div className="bg-white rounded-lg p-3 border border-gray-200 w-full">
                                                        <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">이면세계</div>
                                                        <div className="text-lg font-bold text-orange-600">{results[i].sideGrade}</div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="bg-white rounded-lg p-3 border border-gray-200 w-[480px]">
                                                <div className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">캐릭터 배열</div>
                                                <code className="text-[14px] bg-gray-100 p-2 rounded border font-mono overflow-x-auto flex justify-end pr-24">
                                                    {results[i].arr.slice(0, 9).join(', ')}
                                                    <br />
                                                    {results[i].arr.slice(9).join(', ')}
                                                </code>
                                            </div>
                                        </div>
                                    )}
                                </div>

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

export default ProcessClashV2Component;