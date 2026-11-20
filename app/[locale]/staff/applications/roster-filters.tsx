'use client';
import type {ReactNode} from 'react';
import {AppForm} from '../../app-form';

export function StaffApplicationFilters({children}:{children:ReactNode}){
  return <AppForm method="get" onChange={event=>{
    if(event.target instanceof HTMLSelectElement&&event.target.name==='status')event.currentTarget.requestSubmit();
  }}>{children}</AppForm>;
}
