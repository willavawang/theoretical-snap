'use strict';
const crypto=require('node:crypto');
function identity(s){
 if(!s.trainingRunId)s.trainingRunId=crypto.randomUUID();
 return {runId:s.trainingRunId,modelEstimatorFingerprint:s.fingerprint,iterations:s.iterations,passes:s.passes,randomState:s.random.state,exploration:s.options.exploration};
}
function fingerprint(s){return crypto.createHash('sha256').update(JSON.stringify(identity(s))).digest('hex');}
module.exports={identity,fingerprint};
