import Tesseract from 'tesseract.js';

const workers = {};            // `${langs}|plain` 또는 `${langs}|param` -> Promise<Worker>
let queue = Promise.resolve(); // setParameters 와 recognize 사이에 다른 요청이 끼어들지 못하게 한다.

const PARAM_DEFAULTS = {
    tessedit_char_whitelist: '',                      // 글자 제한 없음
    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE, // 이 프로젝트의 OCR 대상은 모두 한 줄이다
};

function getWorker(key, langs) {
    if (!workers[key]) {
        workers[key] = Tesseract.createWorker(langs, 1).catch((e) => {
            delete workers[key]; // 생성 실패가 캐시에 남아 다음 호출까지 막지 않도록
            throw e;
        });
    }
    return workers[key];
}

// Tesseract.recognize(image, langs, options) 대체
export function recognize(image, langs = 'eng', options, params) {
    const key = `${langs}|${params ? 'param' : 'plain'}`;
    const job = queue.then(async () => {
        const worker = await getWorker(key, langs);
        if (params) await worker.setParameters({ ...PARAM_DEFAULTS, ...params });
        return worker.recognize(image);
    });
    queue = job.catch(() => {}); // 앞 요청이 실패해도 다음 요청은 계속 진행한다
    return job;
}

// 만들어 둔 워커를 모두 종료한다. (진행 중인 요청이 끝난 뒤 정리하며, 이후 recognize 를 부르면 워커를 다시 만든다)
export async function terminateOcrWorkers() {
    await queue;
    const list = Object.values(workers);
    Object.keys(workers).forEach((k) => delete workers[k]);
    await Promise.all(list.map((p) => p.then((w) => w.terminate()).catch(() => {})));
}