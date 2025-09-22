exports.handler = async (event, context) => {
  // CORS 처리
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { action, logData } = JSON.parse(event.body);
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    
    if (!GITHUB_TOKEN) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'GitHub token not configured' })
      };
    }

    if (action === 'writeLog') {
      const fileName = `${logData.date}.json`;
      
      // 기존 파일 가져오기
      let existingLogs = [];
      let sha = null;
      
      try {
        const getResponse = await fetch(`https://api.github.com/repos/bsens90-wq/hwg_logs/contents/logs/${fileName}`, {
          headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });
        
        if (getResponse.ok) {
          const fileData = await getResponse.json();
          const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
          existingLogs = JSON.parse(content);
          sha = fileData.sha;
        }
      } catch (e) {
        existingLogs = [];
      }
      
      // 새 로그 추가
      existingLogs.push(logData);
      
      // GitHub에 업로드
      const encodedContent = Buffer.from(JSON.stringify(existingLogs, null, 2)).toString('base64');
      
      const payload = {
        message: `로그 업데이트: ${fileName}`,
        content: encodedContent,
        ...(sha && { sha })
      };
      
      const response = await fetch(`https://api.github.com/repos/bsens90-wq/hwg_logs/contents/logs/${fileName}`, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true })
        };
      } else {
        const errorText = await response.text();
        return {
          statusCode: response.status,
          headers,
          body: JSON.stringify({ error: errorText })
        };
      }
      
    } else if (action === 'readLogs') {
      const response = await fetch(`https://api.github.com/repos/bsens90-wq/hwg_logs/contents/logs`, {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      
      if (!response.ok) {
        return {
          statusCode: response.status,
          headers,
          body: JSON.stringify({ error: 'Failed to read logs' })
        };
      }
      
      const files = await response.json();
      const logFiles = files.filter(file => file.name.endsWith('.json'));
      
      let allLogs = [];
      for (const file of logFiles) {
        try {
          const fileResponse = await fetch(file.download_url);
          const logs = await fileResponse.json();
          allLogs = allLogs.concat(logs);
        } catch (e) {
          console.error(`파일 ${file.name} 로드 실패:`, e);
        }
      }
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ logs: allLogs })
      };
    }
    
  } catch (error) {
    console.error('Proxy error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
