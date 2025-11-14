import * as ort from 'onnxruntime-web';
import { useEffect, useState } from "react";
import ConvertJsonComponent from '../components/ConvertJsonComponent';
import ProcessClashComponent from '../components/ProcessClashComponent';
import ProcessClashV2Component from '../components/ProcessClashV2Component';
import ProcessFrontierComponent from '../components/ProcessFrontierComponent';
import HeaderNav from "../layouts/HeaderNav";

const IndexPage = () => {

    const [selectType, setSelectType] = useState('clash')
    const [session, setSession] = useState(null);
    const [debugInfo, setDebugInfo] = useState('');

    // 1) ONNX Runtime 세션 초기화
    useEffect(() => {
        const loadModel = async () => { // 이 비동기 함수를 정의
            try {
                console.log('ONNX Runtime 초기화 시작...');
                setDebugInfo('모델 로딩 중...');
                // await 키워드는 async 함수 내부에서만 사용 가능합니다.
                // setTimeout 안에 await를 직접 넣는 것보다, setTimeout 없이 바로 실행하거나
                // setTimeout의 콜백 자체를 async로 만드는 것이 좋습니다.
                // 여기서는 setTimeout을 제거하고 바로 로드합니다.
                const s = await ort.InferenceSession.create('/models/vision_model.onnx');
                setSession(s);
                setDebugInfo('✅ 모델 준비됨');
                console.log('ONNX Runtime 초기화 완료.');
            } catch (error) {
                console.error('모델 로딩 실패:', error);
                setDebugInfo('모델 로딩 실패: ' + error.message);
            }
        };

        loadModel(); // 정의한 비동기 함수 즉시 호출
    }, []); // 빈 배열은 컴포넌트 마운트 시 한 번만 실행


    const radioHandler = (e) => {
        setSelectType(e.target.value);
    }

    return (
        <div>
            <HeaderNav />
            <ConvertJsonComponent
                session={session}
                setDebugInfo={setDebugInfo}
                debugInfo={debugInfo}
            />
            <div className='flex justify-center items-center my-4 p-4 gap-x-4 border-y-2 border-black'>
                <label>
                    대충돌 <input type='radio' value={"clash"} onChange={radioHandler} checked={selectType === 'clash'} />
                </label>
                <label>
                    프론티어 <input type='radio' value={"frontier"} onChange={radioHandler} checked={selectType === 'frontier'} />
                </label>
                <label>
                    대충돌 2.0 <input type='radio' value={"clash_v2"} onChange={radioHandler} checked={selectType === 'clash_v2'} />
                </label>
            </div>
            {selectType === 'clash' && (
                <ProcessClashComponent
                    session={session}
                    setDebugInfo={setDebugInfo}
                    debugInfo={debugInfo}
                />
            )}
            {selectType === 'frontier' && (
                <ProcessFrontierComponent
                    session={session}
                    setDebugInfo={setDebugInfo}
                    debugInfo={debugInfo}
                />
            )}
            {selectType === 'clash_v2' && (
                <ProcessClashV2Component
                    session={session}
                    setDebugInfo={setDebugInfo}
                    debugInfo={debugInfo}
                />
            )}
        </div>
    );
}

export default IndexPage;