import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, Alert, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard'; // ✅ FIX: بدلاً من react-native Clipboard
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { TH } from '../lib/theme';
import { STR } from '../lib/strings';
import { getSymbol } from '../lib/constants';
import { Touchable as TouchableOpacity } from '../components/AppPrimitives';
import { supabase } from '../lib/supabase';
import { calcStats, byMonth } from '../utils/calc';
import { weight } from '../lib/tokens';

export default function SpaceScreen() {
  const { cfg, user, trans } = useStore();
  const th  = TH[cfg.theme] || TH.dark;
  const L   = STR[cfg.lang]  || STR.ar;
  const sym = getSymbol(cfg.currency);

  const [room,      setRoom]      = useState(null);
  const [members,   setMembers]   = useState([]);
  const [codeInput, setCodeInput] = useState('');
  const [loading,   setLoading]   = useState(false);

  const fmt = (n) => Math.abs(n).toLocaleString();

  useEffect(() => { if (user) loadRoom(); }, [user]);

  const loadRoom = async () => {
    try {
      const { data } = await supabase.from('family_rooms').select('*').eq('owner_id', user.id).single();
      if (data) { setRoom(data); loadMembers(data.id); return; }
      const { data: mem } = await supabase.from('room_members').select('room_id').eq('user_id', user.id).single();
      if (mem) {
        const { data: r } = await supabase.from('family_rooms').select('*').eq('id', mem.room_id).single();
        if (r) { setRoom(r); loadMembers(r.id); }
      }
    } catch {}
  };

  const loadMembers = async (roomId) => {
    try {
      const { data } = await supabase.from('room_members').select('user_id, user_data(trans,cfg)').eq('room_id', roomId);
      setMembers(data || []);
    } catch {}
  };

  const createRoom = async () => {
    if (!user) return Alert.alert('', cfg.lang==='ar' ? 'سجّل دخولك أولاً' : 'Sign in first');
    setLoading(true);
    try {
      const code = Math.random().toString(36).slice(2,8).toUpperCase();
      const { data, error } = await supabase.from('family_rooms').insert({ owner_id: user.id, code }).select().single();
      if (error) throw error;
      await supabase.from('room_members').insert({ room_id: data.id, user_id: user.id });
      setRoom(data);
      loadMembers(data.id);
      Alert.alert(L.roomCreated, `${L.roomCode}: ${data.code}`);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = async () => {
    if (!user) return Alert.alert('', cfg.lang==='ar' ? 'سجّل دخولك أولاً' : 'Sign in first');
    if (!codeInput.trim()) return;
    setLoading(true);
    try {
      const { data: r, error } = await supabase.from('family_rooms').select('*').eq('code', codeInput.trim().toUpperCase()).single();
      if (error || !r) throw new Error(cfg.lang==='ar' ? 'كود غير صحيح' : 'Invalid code');
      await supabase.from('room_members').upsert({ room_id: r.id, user_id: user.id });
      setRoom(r);
      loadMembers(r.id);
      Alert.alert(L.roomJoined);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const leaveRoom = async () => {
    if (!room) return;
    await supabase.from('room_members').delete().eq('room_id', room.id).eq('user_id', user.id);
    if (room.owner_id === user.id) await supabase.from('family_rooms').delete().eq('id', room.id);
    setRoom(null);
    setMembers([]);
    Alert.alert(L.roomLeft); // ✅ مضاف في strings.js
  };

  // ✅ FIX: async + expo-clipboard API
  const copyCode = async () => {
    if (!room?.code) return;
    await Clipboard.setStringAsync(room.code);
    Alert.alert(L.copiedCode);
  };

  const now    = new Date();
  const myStats = calcStats(byMonth(trans, now.getMonth(), now.getFullYear()));

  if (!user) {
    return (
      <View style={{ flex:1, backgroundColor: th.bg, alignItems:'center', justifyContent:'center', padding:32 }}>
        <Ionicons name="people-circle-outline" size={48} color={th.primary} style={{ marginBottom:16 }} />
        <Text style={{ color: th.text, fontSize:18, ...weight('700'), textAlign:'center', marginBottom:8 }}>{L.spaceTab}</Text>
        <Text style={{ color: th.sub, fontSize:14, textAlign:'center' }}>
          {cfg.lang==='ar' ? 'سجّل دخولك لاستخدام الغرفة المشتركة' : 'Sign in to use the shared room'}
        </Text>
      </View>
    );
  }

  if (!room) {
    return (
      <ScrollView style={{ flex:1, backgroundColor: th.bg }} contentContainerStyle={{ padding:24, alignItems:'center' }}>
        <Ionicons name="people-circle-outline" size={48} color={th.primary} style={{ marginBottom:16, marginTop:20 }} />
        <Text style={{ color: th.text, fontSize:20, ...weight('800'), marginBottom:8 }}>{L.spaceTab}</Text>
        <Text style={{ color: th.sub, fontSize:14, textAlign:'center', marginBottom:32 }}>{L.noRoom}</Text>

        <TouchableOpacity onPress={createRoom} disabled={loading}
          style={[s.bigBtn, { backgroundColor: th.primary }]}>
          <Text style={{ color: th.onPrim, ...weight('800'), fontSize:15 }}>+ {L.createRoom}</Text>
        </TouchableOpacity>

        <Text style={{ color: th.sub, marginVertical:20 }}>{cfg.lang==='ar' ? 'أو' : 'OR'}</Text>

        <TextInput value={codeInput} onChangeText={setCodeInput}
          placeholder={L.roomCodeHint} placeholderTextColor={th.sub} // ✅ مضاف في strings.js
          autoCapitalize="characters"
          style={[s.input, { backgroundColor: th.input, color: th.text, borderColor: th.border, width:'100%' }]}/>
        <TouchableOpacity onPress={joinRoom} disabled={loading}
          style={[s.bigBtn, { backgroundColor: th.card, borderColor: th.border, borderWidth:1, width:'100%' }]}>
          <Text style={{ color: th.text, ...weight('700'), fontSize:15 }}>{L.joinRoom}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ flex:1, backgroundColor: th.bg }} contentContainerStyle={{ padding:16, paddingBottom:40 }}>
      <View style={[s.card, { backgroundColor: th.card, borderColor: th.border }]}>
        <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
          <Text style={{ color: th.text, ...weight('800'), fontSize:18 }}>{L.spaceTab}</Text>
          <TouchableOpacity onPress={copyCode} style={[s.codeChip, { backgroundColor: th.primSoft, flexDirection:'row', alignItems:'center', gap:6 }]}>
            <Text style={{ color: th.primary, ...weight('700'), fontSize:13 }}>{room.code}</Text>
            <Ionicons name="copy-outline" size={13} color={th.primary} />
          </TouchableOpacity>
        </View>
        <Text style={{ color: th.sub, fontSize:12, marginTop:4 }}>
          {members.length} {L.roomMembers} {/* ✅ مضاف في strings.js */}
        </Text>
      </View>

      <View style={[s.card, { backgroundColor: th.card, borderColor: th.border, marginTop:12 }]}>
        <Text style={{ color: th.sub, fontSize:12, ...weight('700'), marginBottom:10 }}>{L.myShare}</Text>
        {/* ✅ مضاف في strings.js */}
        <View style={{ flexDirection:'row', justifyContent:'space-between' }}>
          <View>
            <Text style={{ color: th.inc, ...weight('800'), fontSize:18 }}>+{fmt(myStats.inc)} {sym}</Text>
            <Text style={{ color: th.sub, fontSize:11 }}>{L.memberIncome}</Text>
            {/* ✅ مضاف في strings.js */}
          </View>
          <View style={{ alignItems:'flex-end' }}>
            <Text style={{ color: th.exp, ...weight('800'), fontSize:18 }}>-{fmt(myStats.exp)} {sym}</Text>
            <Text style={{ color: th.sub, fontSize:11 }}>{L.memberExpense}</Text>
            {/* ✅ مضاف في strings.js */}
          </View>
        </View>
      </View>

      <TouchableOpacity onPress={() => Alert.alert(L.leaveRoom, '', [
        { text: L.no, style:'cancel' },
        { text: L.yes, style:'destructive', onPress: leaveRoom },
      ])} style={[s.bigBtn, { backgroundColor: th.expBg, marginTop:20, borderColor: th.exp+'44', borderWidth:1 }]}>
        <Text style={{ color: th.exp, ...weight('700') }}>{L.leaveRoom}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  card:     { borderRadius:16, padding:16, borderWidth:0.5 },
  bigBtn:   { borderRadius:14, padding:14, alignItems:'center', width:'100%', marginBottom:8 },
  input:    { borderRadius:12, padding:12, borderWidth:0.5, marginBottom:10, fontSize:14, textAlign:'center' },
  codeChip: { paddingHorizontal:12, paddingVertical:6, borderRadius:10 },
});
