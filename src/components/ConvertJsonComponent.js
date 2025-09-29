import * as ort from 'onnxruntime-web';
import { useRef, useState } from 'react';
import { onnxPreprocess } from '../utils/embeddingFunction';
import { loadImage } from '../utils/function';

const ConvertJsonComponent = ({ session, debugInfo, setDebugInfo }) => {
  const [files, setFiles] = useState([]);
  const [embeddings, setEmbeddings] = useState({});
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const canvasRef = useRef(document.createElement('canvas'));

  // 파일 선택 핸들러
  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles(selectedFiles);
    setEmbeddings({}); // 새로운 파일 선택 시 기존 임베딩 초기화
    setProgress({ current: 0, total: selectedFiles.length });
    setDebugInfo(`${selectedFiles.length}개 파일 선택됨`);

    // 선택된 파일 목록을 콘솔에 출력
    console.log('선택된 파일들:', selectedFiles.map(f => f.name));
  };

  // 단일 이미지의 임베딩 생성 함수
  const generateSingleEmbedding = async (file) => {
    try {
      // 파일을 이미지로 로드
      const url = URL.createObjectURL(file);
      const img = await loadImage(url);

      console.log(`${file.name} 이미지 로딩 완료: ${img.width}x${img.height}`);

      // 이미지 전처리
      const inputTensor = onnxPreprocess(img, canvasRef, ort);
      console.log(`${file.name} 전처리 완료, 텐서 크기:`, inputTensor.dims);

      // 모델 추론 실행
      const feeds = { pixel_values: inputTensor };
      const outputs = await session.run(feeds);

      // 임베딩 추출 - 다양한 출력 키를 시도
      let embedding = null;
      const possibleKeys = ['image_embeds', 'image_embeddings', 'last_hidden_state', 'pooler_output'];

      for (const key of possibleKeys) {
        if (outputs[key]) {
          embedding = outputs[key].data;
          console.log(`${file.name}: 임베딩을 ${key}에서 찾음, 크기: ${embedding.length}`);
          break;
        }
      }

      if (!embedding) {
        throw new Error(`${file.name}: 임베딩을 찾을 수 없습니다. 출력 키: ${Object.keys(outputs).join(', ')}`);
      }

      // 임베딩 정규화 (단위 벡터로 변환)
      const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      const normalizedEmbedding = embedding.map(val => val / norm);

      // 파일명에서 확장자 제거하여 캐릭터 이름 추출
      const characterName = file.name.replace(/\.[^/.]+$/, "");

      // 메모리 정리
      URL.revokeObjectURL(url);

      return {
        name: characterName,
        embedding: normalizedEmbedding
      };

    } catch (error) {
      console.error(`${file.name} 처리 중 오류:`, error);
      throw error;
    }
  };

  // 모든 파일의 임베딩 생성 (순차 처리)
  const generateAllEmbeddings = async () => {
    if (!session || files.length === 0) {
      setDebugInfo('모델이 준비되지 않았거나 파일이 선택되지 않았습니다.');
      return;
    }

    setProcessing(true);
    setEmbeddings({});
    const newEmbeddings = {};

    try {
      console.log(`총 ${files.length}개 파일 처리 시작`);
      setDebugInfo('임베딩 생성 시작...');

      // 각 파일을 순차적으로 처리 (안정성을 위해)
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        setProgress({ current: i + 1, total: files.length });
        setDebugInfo(`처리 중: ${file.name} (${i + 1}/${files.length})`);

        try {
          const result = await generateSingleEmbedding(file);
          newEmbeddings[result.name] = result.embedding;

          console.log(`✅ ${result.name} 임베딩 생성 완료 (${result.embedding.length}차원)`);

          // 실시간으로 상태 업데이트
          setEmbeddings({ ...newEmbeddings });

        } catch (error) {
          console.error(`❌ ${file.name} 처리 실패:`, error.message);
          // 개별 파일 실패해도 계속 진행
        }

        // 각 파일 처리 후 잠시 대기 (브라우저가 다른 작업을 처리할 시간 제공)
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      setDebugInfo(`✅ 모든 임베딩 생성 완료! 총 ${Object.keys(newEmbeddings).length}개`);
      console.log('모든 임베딩 생성 완료:', Object.keys(newEmbeddings));

    } catch (error) {
      console.error('임베딩 생성 중 오류:', error);
      setDebugInfo('오류: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  // JSON 파일 다운로드 함수
  const downloadEmbeddings = () => {
    if (Object.keys(embeddings).length === 0) {
      alert('다운로드할 임베딩이 없습니다.');
      return;
    }

    // JSON 데이터를 문자열로 변환
    const jsonData = JSON.stringify(embeddings, null, 2);

    // Blob 생성 및 다운로드 링크 생성
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    // 가상의 다운로드 링크를 만들어 클릭
    const link = document.createElement('a');
    link.href = url;
    link.download = 'embeddings.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // 메모리 정리
    URL.revokeObjectURL(url);

    console.log('embeddings.json 파일 다운로드 완료');
  };

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: '0 auto' }}>
      <h2>🧠 캐릭터 임베딩 생성기</h2>

      {/* 상태 정보 표시 */}
      <div style={{
        marginBottom: 20,
        padding: 16,
        backgroundColor: '#f8f9fa',
        borderRadius: 8,
        border: '1px solid #dee2e6'
      }}>
        <div style={{ marginBottom: 8 }}>
          <strong>모델 상태:</strong> {session ? '✅ 준비됨' : '⏳ 로딩 중...'}
        </div>
        <div style={{ marginBottom: 8 }}>
          <strong>진행 상황:</strong> {progress.current}/{progress.total}
          {progress.total > 0 && (
            <span style={{ marginLeft: 8 }}>
              ({Math.round(progress.current / progress.total * 100)}%)
            </span>
          )}
        </div>
        <div>
          <strong>상태:</strong> {debugInfo || '대기 중...'}
        </div>
      </div>

      {/* 파일 선택 영역 */}
      <div style={{ marginBottom: 20 }}>
        <label style={{
          display: 'block',
          marginBottom: 8,
          fontSize: 16,
          fontWeight: 'bold'
        }}>
          📁 캐릭터 이미지 파일들 선택:
        </label>
        <input
          type="file"
          multiple
          accept="image/*"
          onChange={handleFileSelect}
          disabled={!session || processing}
          style={{
            padding: 8,
            width: '100%',
            border: '2px dashed #dee2e6',
            borderRadius: 4
          }}
        />
        <div style={{ marginTop: 8, fontSize: 14, color: '#6c757d' }}>
          파일명이 캐릭터 이름으로 사용됩니다.
        </div>
      </div>

      {/* 선택된 파일 목록 미리보기 */}
      {files.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h4>선택된 파일들 ({files.length}개):</h4>
          <div style={{
            maxHeight: 200,
            overflowY: 'auto',
            border: '1px solid #dee2e6',
            borderRadius: 4,
            padding: 12,
            backgroundColor: '#f8f9fa'
          }}>
            {files.map((file, index) => (
              <div key={index} style={{
                marginBottom: 4,
                fontSize: 14,
                color: embeddings[file.name.replace(/\.[^/.]+$/, "")] ? '#28a745' : '#6c757d'
              }}>
                {embeddings[file.name.replace(/\.[^/.]+$/, "")] ? '✅' : '⏳'} {file.name}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 실행 버튼들 */}
      <div style={{ marginBottom: 20, display: 'flex', gap: 12 }}>
        <button
          onClick={generateAllEmbeddings}
          disabled={!session || files.length === 0 || processing}
          style={{
            padding: '12px 24px',
            backgroundColor: processing ? '#6c757d' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: processing ? 'not-allowed' : 'pointer',
            fontSize: 16,
            fontWeight: 'bold'
          }}
        >
          {processing ? '⏳ 처리 중...' : '🚀 임베딩 생성 시작'}
        </button>

        <button
          onClick={downloadEmbeddings}
          disabled={Object.keys(embeddings).length === 0}
          style={{
            padding: '12px 24px',
            backgroundColor: Object.keys(embeddings).length === 0 ? '#6c757d' : '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: Object.keys(embeddings).length === 0 ? 'not-allowed' : 'pointer',
            fontSize: 16,
            fontWeight: 'bold'
          }}
        >
          💾 JSON 파일 다운로드
        </button>
      </div>

      {/* 진행률 바 */}
      {progress.total > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{
            width: '100%',
            height: 20,
            backgroundColor: '#e9ecef',
            borderRadius: 10,
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${(progress.current / progress.total) * 100}%`,
              height: '100%',
              backgroundColor: processing ? '#007bff' : '#28a745',
              transition: 'width 0.3s ease'
            }} />
          </div>
          <div style={{ textAlign: 'center', marginTop: 4, fontSize: 14 }}>
            {progress.current} / {progress.total} 완료
          </div>
        </div>
      )}

      {/* 결과 미리보기 */}
      {Object.keys(embeddings).length > 0 && (
        <div style={{
          marginTop: 20,
          padding: 16,
          backgroundColor: '#f8fff9',
          border: '2px solid #28a745',
          borderRadius: 8
        }}>
          <h4 style={{ color: '#28a745', marginTop: 0 }}>
            🎉 생성된 임베딩 ({Object.keys(embeddings).length}개)
          </h4>
          <div style={{
            maxHeight: 300,
            overflowY: 'auto',
            fontSize: 14
          }}>
            {Object.entries(embeddings).map(([name, embedding]) => (
              <div key={name} style={{ marginBottom: 8 }}>
                <strong>{name}:</strong> {embedding.length}차원 벡터
                <span style={{ color: '#6c757d', marginLeft: 8 }}>
                  (예: {embedding.slice(0, 3).map(v => v.toFixed(3)).join(', ')}...)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 숨겨진 캔버스 */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}

export default ConvertJsonComponent;