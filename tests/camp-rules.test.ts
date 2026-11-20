import {test} from 'node:test';
import assert from 'node:assert/strict';
import {campRulesIdentity,campRulesAcknowledged,campRulesConfigurationProblems,campRulesUrlValid} from '../lib/camp-rules.ts';

test('camp rules are an explicit election with title, revision and readable document',()=>{
 assert.deepEqual(campRulesConfigurationProblems({counselorRulesName:'Legacy title',counselorRules:'yes'}),[]);
 assert.equal(campRulesIdentity({counselorRulesName:'Legacy title'}),'');
 assert.deepEqual(campRulesConfigurationProblems({campRulesRequired:'yes'}),['campRulesTitle','campRulesRevision','campRulesSource']);
 for(const url of ['javascript:alert(1)','http://example.test/rules','https://user:password@example.test/rules','not a link'])assert.equal(campRulesUrlValid(url),false);
 assert.equal(campRulesUrlValid('https://example.test/rules.pdf'),true);
 assert.ok(campRulesConfigurationProblems({campRulesRequired:'yes',campRulesTitle:'Book',campRulesRevision:'5',campRulesSource:'file',campRulesFile:'not-an-id'}).includes('campRulesFile'));
});

test('acknowledgment is automatic only for the exact document identity and recorded time',()=>{
 const rules={campRulesRequired:'yes',campRulesTitle:'Camp Rules Book',campRulesRevision:'5',campRulesSource:'link',campRulesUrl:'https://example.test/rules.pdf'};
 const data={campRulesAcknowledgment:campRulesIdentity(rules),campRulesAcknowledgedAt:'2026-11-18T12:00:00Z'};
 assert.equal(campRulesAcknowledged(rules,data),true);assert.equal(campRulesAcknowledged(rules,{campRulesAcknowledgment:data.campRulesAcknowledgment}),false);
 assert.equal(campRulesAcknowledged(rules,{...data,campRulesAcknowledgedAt:'not a date'}),false);
 for(const field of ['campRulesTitle','campRulesRevision','campRulesUrl'])assert.equal(campRulesAcknowledged({...rules,[field]:field==='campRulesUrl'?'https://example.test/updated.pdf':'Changed'},data),false);
 assert.equal(campRulesAcknowledged({...rules,campRulesRequired:''},data),false);
 assert.equal(campRulesAcknowledged(rules,{counselorRulesAccepted:'Camp Rules Book',conduct:'yes'}),false);
});
