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

// 기존 코드 뒤에 추가
else if (action === 'updateLastActivity') {
  // 사용자 마지막 활동 시간 업데이트
  const { userCode } = logData;
  const today = new Date().toISOString().split('T')[0];
  
  try {
    // employees.json 파일 가져오기
    const empResponse = await fetch(`https://api.github.com/repos/bsens90-wq/hwg_main/contents/data/employees.json`, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (empResponse.ok) {
      const empFileData = await empResponse.json();
      const empContent = Buffer.from(empFileData.content, 'base64').toString('utf-8');
      let employees = JSON.parse(empContent);
      
      // 해당 사용자의 lastActivity 업데이트
      const userIndex = employees.findIndex(emp => emp.empno === userCode);
      if (userIndex !== -1) {
        employees[userIndex].lastActivity = today;
        
        // 파일 업데이트
        const updatedContent = Buffer.from(JSON.stringify(employees, null, 2)).toString('base64');
        
        const updateResponse = await fetch(`https://api.github.com/repos/bsens90-wq/hwg_main/contents/data/employees.json`, {
          method: 'PUT',
          headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: `사용자 ${userCode} 활동 시간 업데이트`,
            content: updatedContent,
            sha: empFileData.sha
          })
        });
        
        if (updateResponse.ok) {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true })
          };
        }
      }
    }
  } catch (error) {
    console.error('활동 시간 업데이트 오류:', error);
  }
  
} else if (action === 'checkInactiveUsers') {
  // 30일 미활성 사용자 체크 및 일시정지
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
  
  try {
    // employees.json 가져오기
    const empResponse = await fetch(`https://api.github.com/repos/bsens90-wq/hwg_main/contents/data/employees.json`, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (empResponse.ok) {
      const empFileData = await empResponse.json();
      const empContent = Buffer.from(empFileData.content, 'base64').toString('utf-8');
      let employees = JSON.parse(empContent);
      
      let updated = false;
      const today = new Date().toISOString().split('T')[0];
      
      employees.forEach(emp => {
        // 관리자는 제외
        if (emp.empno === '8091768') return;
        
        // 30일 이상 미활성이고 active 상태인 사용자
        if (emp.status === 'active' && 
            (!emp.lastActivity || emp.lastActivity < thirtyDaysAgoStr)) {
          
          // 랜덤 4자리 패스워드 생성
          const randomPassword = Math.floor(1000 + Math.random() * 9000).toString();
          
          emp.password = randomPassword;
          emp.status = 'suspended';
          emp.suspendedDate = today;
          updated = true;
        }
      });
      
      if (updated) {
        // 파일 업데이트
        const updatedContent = Buffer.from(JSON.stringify(employees, null, 2)).toString('base64');
        
        await fetch(`https://api.github.com/repos/bsens90-wq/hwg_main/contents/data/employees.json`, {
          method: 'PUT',
          headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: `비활성 사용자 일시정지 처리 - ${today}`,
            content: updatedContent,
            sha: empFileData.sha
          })
        });
      }
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, updated })
      };
    }
  } catch (error) {
    console.error('비활성 사용자 체크 오류:', error);
  }
  
} else if (action === 'reactivateUser') {
  // 관리자가 사용자 재승인
  const { userCode } = JSON.parse(event.body);
  
  try {
    const empResponse = await fetch(`https://api.github.com/repos/bsens90-wq/hwg_main/contents/data/employees.json`, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (empResponse.ok) {
      const empFileData = await empResponse.json();
      const empContent = Buffer.from(empFileData.content, 'base64').toString('utf-8');
      let employees = JSON.parse(empContent);
      
      const userIndex = employees.findIndex(emp => emp.empno === userCode);
      if (userIndex !== -1) {
        employees[userIndex].password = '1111';
        employees[userIndex].status = 'active';
        employees[userIndex].suspendedDate = null;
        employees[userIndex].lastActivity = new Date().toISOString().split('T')[0];
        
        const updatedContent = Buffer.from(JSON.stringify(employees, null, 2)).toString('base64');
        
        const updateResponse = await fetch(`https://api.github.com/repos/bsens90-wq/hwg_main/contents/data/employees.json`, {
          method: 'PUT',
          headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: `사용자 ${userCode} 재승인`,
            content: updatedContent,
            sha: empFileData.sha
          })
        });
        
        if (updateResponse.ok) {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true })
          };
        }
      }
    }
  } catch (error) {
    console.error('사용자 재승인 오류:', error);
  }
}
