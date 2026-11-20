import type { PlanningInput } from "../lib/visit-planning-export.ts";

export function planningFixture():PlanningInput&{registered:{student:number;adult:number;leader:number};visitors:unknown[]} {
  return {
    visit:{name:"Fictional ministry trip",church_name:"Sample Church",start:"2027-06-01",end:"2027-06-03",itinerary_revision:4},
    expected:{student:12,adult:6,leader:2},registered:{student:999,adult:888,leader:777},
    visitors:[{name:"PRIVATE_VISITOR",contact:"PRIVATE_CONTACT",health:"PRIVATE_HEALTH"}],
    settings:{share_group_costs:true,personal_extra_cents:500},
    activities:[{id:"activity",day:"2027-06-01",title:"Orphanage visit",time:"08:00",location:"Sample location",archived_at:null},
      {id:"free-time",day:"2027-06-02",title:"Free time",time:null,location:"At camp",archived_at:null},
      {id:"archived",day:"2027-06-01",title:"ARCHIVED_ACTIVITY",time:null,location:"",archived_at:"2026-11-14"}],
    costs:[
      {id:"breakfast",activity_id:"activity",description:"Breakfast",payer:"camp",basis:"person",applies_to:"all",quantity_override:null,unit_cents:500,meal:"breakfast",meal_source:"camp",archived_at:null},
      {id:"lunch",activity_id:"activity",description:"Packed lunch",payer:"camp",basis:"person",applies_to:"all",quantity_override:null,unit_cents:600,meal:"lunch",meal_source:"packed",archived_at:null},
      {id:"bus",activity_id:"activity",description:"Group bus",payer:"camp",basis:"group",applies_to:"all",quantity_override:null,unit_cents:15000,meal:null,meal_source:null,archived_at:null},
      {id:"donation",activity_id:"activity",description:"Donation",payer:"church",basis:"group",applies_to:"all",quantity_override:null,unit_cents:10000,meal:null,meal_source:null,archived_at:null},
      {id:"dinner",activity_id:"activity",description:"Restaurant",payer:"personal",basis:"person",applies_to:"all",quantity_override:null,unit_cents:1200,meal:"dinner",meal_source:"outside",archived_at:null},
      {id:"lodging",activity_id:null,description:"Lodging for visit",payer:"camp",basis:"group",applies_to:"all",quantity_override:null,unit_cents:20000,meal:null,meal_source:null,archived_at:null},
      {id:"archived-cost",activity_id:"activity",description:"ARCHIVED_COST",payer:"camp",basis:"person",applies_to:"all",quantity_override:null,unit_cents:90000,meal:null,meal_source:null,archived_at:"2026-11-14"},
      {id:"archived-activity-cost",activity_id:"archived",description:"ARCHIVED_ACTIVITY_COST",payer:"camp",basis:"person",applies_to:"all",quantity_override:null,unit_cents:90000,meal:null,meal_source:null,archived_at:null},
    ],
  };
}
