import { extractGradeRobust } from "./ocrFunction";

/**
 * OCR 결과(region1, region2)를 받아서
 *   grade (단계), score, duration(초), timeBonus
 * 를 추출합니다.
 */
export function parseClashInfo({ region1, region2 }) {
    const result = {
        grade: null,
        duration: null,     // 플레이타임(초)
    };

    // 1) grade: xx단계 에서 숫자만
    {
        const m = region1.match(/(\d+)\s*단계/);
        if (m) {
            result.grade = parseInt(m[1], 10);
        }
    }
    {
        // 00@:42, 00:@42처럼 OCR 오인식으로 @가 포함되는 경우 대비 @ 제거
        const cleanedRegion2 = region2.replace(/@/g, '');

        // region2 == 플레이시간 00:28 또는 0028 에서 mmss → 초
        // 1) “MM:SS” 또는 “M:SS” 형태 (초 자리가 1~2자리)
        let m = cleanedRegion2.match(/^([0-9]{1,2}):([0-9]{1,2})$/);

        if (m) {
            let [, minStr, secStr] = m;
            let minutes = parseInt(minStr, 10);
            let seconds = parseInt(secStr, 10);

            // “00:9” 같은 경우 → 9 + 10 = 19
            if (minStr === "00" && secStr.length === 1) {
                seconds += 10;
            }
            result.duration = minutes * 60 + seconds;
        } else {
            // 2) 콜론 없이 “MMSS” (4자리) 또는 “SSS” (3자리) 형태
            m = region2.match(/^[0-9]{3,4}$/);
            if (m) {
                const s = m[0]; // ex: "009", "0173", "1234"
                let minutes, seconds;

                if (s.length === 3) {
                    // "009", "007" 같은 경우 → 앞 두 자가 "00"이면 초에 10을 더함
                    if (s.startsWith("00")) {
                        minutes = 0;
                        seconds = 10 + parseInt(s.charAt(2), 10);
                    } else {
                        // 예외: "123" 같은 3자리 → 1분 23초로 처리
                        minutes = parseInt(s.charAt(0), 10);
                        seconds = parseInt(s.slice(1), 10);
                    }
                } else {
                    // 4자리 "MMSS"
                    minutes = parseInt(s.slice(0, -2), 10);
                    seconds = parseInt(s.slice(-2), 10);
                }
                result.duration = minutes * 60 + seconds;
            }
        }
    }

    return result;
}


export function parseFrontierInfo({ region1, region2, region3, region4 }) {
    const result = {
        grade: null,
        score: null,
        duration: null,     // 플레이타임(초)
        coin: null
    };


    {
        // region1 == 단계 ex) 용암맛2
        const m = extractGradeRobust(region1)
        if (m) {
            result.grade = m;
        }
    }


    {
        // region2 == 점수
        const cleaned = region2.replace(/[,.]/g, ''); // .과 ,를 지우기
        result.score = parseInt(cleaned, 10);

    }

    {
        // region4 == 실체의 코인
        const cleaned = region4.replace(/[,.]/g, '');
        result.coin = parseInt(cleaned, 10);

    }

    {
        // region3 == 플레이시간 00:28 또는 0028 에서 mmss → 초
        // 1) “MM:SS” 또는 “M:SS” 형태 (초 자리가 1~2자리)
        let m = region3.match(/^([0-9]{1,2}):([0-9]{1,2})$/);

        if (m) {
            let [, minStr, secStr] = m;
            let minutes = parseInt(minStr, 10);
            let seconds = parseInt(secStr, 10);

            // “00:9” 같은 경우 → 9 + 10 = 19
            if (minStr === "00" && secStr.length === 1) {
                seconds += 10;
            }
            result.duration = minutes * 60 + seconds;
        } else {
            // 2) 콜론 없이 “MMSS” (4자리) 또는 “SSS” (3자리) 형태
            m = region3.match(/^[0-9]{3,4}$/);
            if (m) {
                const s = m[0]; // ex: "009", "0173", "1234"
                let minutes, seconds;

                if (s.length === 3) {
                    // "009", "007" 같은 경우 → 앞 두 자가 "00"이면 초에 10을 더함
                    if (s.startsWith("00")) {
                        minutes = 0;
                        seconds = 10 + parseInt(s.charAt(2), 10);
                    } else {
                        // 예외: "123" 같은 3자리 → 1분 23초로 처리
                        minutes = parseInt(s.charAt(0), 10);
                        seconds = parseInt(s.slice(1), 10);
                    }
                } else {
                    // 4자리 "MMSS"
                    minutes = parseInt(s.slice(0, -2), 10);
                    seconds = parseInt(s.slice(-2), 10);
                }
                result.duration = minutes * 60 + seconds;
            }
        }
    }


    console.log("result: ", result);

    return result;
}


/**
 * OCR 결과(region1, region2)를 받아서
 *   grade (단계), score, duration(초), timeBonus
 * 를 추출합니다.
 */
export function parseClashV2Info({ region1, region2, region3, region4 }) {
    const result = {
        grade: null,
        score: null,     // 점수
        duration: null,     // 플레이시간
        sideGrade: null,     // 이면세계 단계
    };

    // 1) grade: xx단계 에서 숫자만
    {
        const m = region1.match(/(\d+)\s*단계/);
        if (m) {
            result.grade = parseInt(m[1], 10);
        }
    }
    {
        // region2 == 점수
        const cleaned = region2.replace(/[,.]/g, ''); // .과 ,를 지우기
        result.score = parseInt(cleaned, 10);

    }
    {
        // region3 == 플레이시간 00:28 또는 0028 에서 mmss → 초
        // 1) “MM:SS” 또는 “M:SS” 형태 (초 자리가 1~2자리)
        let m = region3.match(/^([0-9]{1,2}):([0-9]{1,2})$/);

        if (m) {
            let [, minStr, secStr] = m;
            let minutes = parseInt(minStr, 10);
            let seconds = parseInt(secStr, 10);

            // “00:9” 같은 경우 → 9 + 10 = 19
            if (minStr === "00" && secStr.length === 1) {
                seconds += 10;
            }
            result.duration = minutes * 60 + seconds;
        } else {
            // 2) 콜론 없이 “MMSS” (4자리) 또는 “SSS” (3자리) 형태
            m = region3.match(/^[0-9]{3,4}$/);
            if (m) {
                const s = m[0]; // ex: "009", "0173", "1234"
                let minutes, seconds;

                if (s.length === 3) {
                    // "009", "007" 같은 경우 → 앞 두 자가 "00"이면 초에 10을 더함
                    if (s.startsWith("00")) {
                        minutes = 0;
                        seconds = 10 + parseInt(s.charAt(2), 10);
                    } else {
                        // 예외: "123" 같은 3자리 → 1분 23초로 처리
                        minutes = parseInt(s.charAt(0), 10);
                        seconds = parseInt(s.slice(1), 10);
                    }
                } else {
                    // 4자리 "MMSS"
                    minutes = parseInt(s.slice(0, -2), 10);
                    seconds = parseInt(s.slice(-2), 10);
                }
                result.duration = minutes * 60 + seconds;
            }
        }
    }
    {
        const m = region4.match(/(\d+)\s*단계/);
        if (m) {
            result.sideGrade = parseInt(m[1], 10);
        }
    }

    return result;
}


// 이미지 객체 로드
export function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous'; // CORS 문제 방지
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}


