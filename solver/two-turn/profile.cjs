'use strict';
const crypto=require('node:crypto'),M=require('./model.cjs'),V=require('./verify.cjs');
const fingerprint=policies=>crypto.createHash('sha256').update(JSON.stringify(policies)).digest('hex');
function pack(game,policies,{independentCertificate}={}){
  const certificate=V.verify(game,policies);
  return {schema:'snap-coupled-profile-1',inputModel:game.input,modelFingerprint:game.fingerprint,policyFingerprint:fingerprint(policies),policies,certificate,
    independentCertificate:independentCertificate||null,scope:game.scope};
}
function restore(profile,limits){
  if(profile.schema!=='snap-coupled-profile-1')throw new Error('Unsupported coupled profile format');
  const game=M.compile(profile.inputModel,limits);
  if(game.fingerprint!==profile.modelFingerprint)throw new Error('Profile model fingerprint mismatch');
  if(fingerprint(profile.policies)!==profile.policyFingerprint)throw new Error('Profile policy fingerprint mismatch');
  // Recalculate bounds. A stored validation label is never trusted on import.
  return {game,policies:profile.policies,certificate:V.verify(game,profile.policies),scope:game.scope};
}
module.exports={pack,restore,fingerprint};
