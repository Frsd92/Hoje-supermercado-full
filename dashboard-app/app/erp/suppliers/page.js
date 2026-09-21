'use client';

import { Building2, Mail, Plus, Search } from 'lucide-react';
import { useState } from 'react';

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const addSupplier = (event) => { event.preventDefault(); if (!name.trim()) return; setSuppliers((current) => [...current, { id: Date.now(), name: name.trim(), email: email.trim() }]); setName(''); setEmail(''); };
  return <div className="erp-module-page"><div className="erp-customer-header"><div><span className="eyebrow">Compras e abastecimento</span><h1>Fornecedores</h1><p>Fornecedores, custos e produtos fornecidos.</p></div></div><form className="erp-inline-form" onSubmit={addSupplier}><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome do fornecedor" required /><input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="E-mail de contato" type="email" /><button className="primary-cta"><Plus size={15} /> Cadastrar</button></form>{suppliers.length ? <div className="erp-simple-list">{suppliers.map((supplier) => <div key={supplier.id}><Building2 size={17} /><strong>{supplier.name}</strong><span><Mail size={13} /> {supplier.email || 'E-mail não informado'}</span></div>)}</div> : <div className="erp-empty-data">Nenhum fornecedor cadastrado. Cadastre fornecedores reais para vincular compras e custos.</div>}</div>;
}