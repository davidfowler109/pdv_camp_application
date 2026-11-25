import {test} from 'node:test';
import assert from 'node:assert/strict';
import {staffStepProblems,staffProblemField,staffProblemStep} from '../lib/staff-application-validation.ts';

test('all staff roles identify incomplete steps without requiring later sections',()=>{
 for(const role of ['guide','equipante','volunteer']){
  assert.deepEqual(staffStepProblems(0,role,{first:'Fictional',last:'Applicant',gender:'female',email:'fictional@example.test',phone:'DEMO',address:'Fictional address'},true),[]);
  const missing=staffStepProblems(1,role,{experience:'Fictional experience',skills:'Fictional skills',motivation:'Fictional motivation'},true);
  assert.ok(missing.includes('weeks'));assert.equal(missing.includes('volunteerAreas'),role==='volunteer');assert.ok(!missing.includes('church'));
  const faith=staffStepProblems(2,role,{church:'Fictional church',pastor:'Fictional pastor',testimony:'Fictional testimony',referencePermission:'yes'},true);
  assert.ok(faith.includes('pastorContact'));assert.equal(faith.includes('believerYears'),role!=='equipante');
  const final=staffStepProblems(3,role,{truth:'yes',referencePermission:'yes'},true);
  assert.equal(final.includes('volunteerConduct'),role==='volunteer');
 }
});
test('problem links reach earlier steps, conditional answers and preparation fields',()=>{
 assert.equal(staffProblemStep('email'),0);assert.equal(staffProblemStep('weeks'),1);assert.equal(staffProblemStep('volunteerChargesDetails'),2);assert.equal(staffProblemStep('truth'),3);
 assert.equal(staffProblemField('pastorContact',{}),'pastorEmail');
 assert.equal(staffProblemField('age',{},true),'birth');assert.equal(staffProblemField('age',{}),'weeks');
 assert.equal(staffProblemField('food',{food:'yes'}),'foodDetails');assert.equal(staffProblemField('food',{food:'none'}),'food');
 assert.equal(staffProblemField('guardianPermission',{}),'guardian');assert.equal(staffProblemField('guardianPermission',{guardian:'Fictional parent'}),'guardianRelationship');
 assert.equal(staffProblemField('campRulesWaiting',{}),'campRulesAcknowledgment');
 const conditional=staffStepProblems(2,'volunteer',{church:'Fixture',pastor:'Fixture',pastorPhone:'DEMO',testimony:'Fixture',referencePermission:'yes',believerYears:'5',volunteerConviction:'yes',volunteerCharges:'no',volunteerRestrictions:'no',volunteerSafeguarding:'no'},true);
 assert.ok(conditional.includes('volunteerConvictionDetails'));
});
