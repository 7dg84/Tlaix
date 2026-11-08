from rest_framework import serializers
from .models import Relation, Student
from rest_framework.validators import UniqueValidator

class RelationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Relation
        fields = ('id', 'student', 'table', 'row')
        read_only_fields = ('id',)
        
class StudentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Student
        fields = ('no_control', 'name', 'plantel', 'carrera', 'turno')
        